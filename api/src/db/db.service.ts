import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');
const MIGRATION_LOCK = 724_001;

/** Anything that can run a query: the pool, or a client inside a transaction. */
export interface Queryable {
  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbService.name);
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  async onModuleInit() {
    await this.migrate();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  private async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
      await client.query(
        `create table if not exists schema_migrations (
           name text primary key,
           applied_at timestamptz not null default now()
         )`,
      );
      const applied = await client.query<{ name: string }>(
        'select name from schema_migrations',
      );
      const done = new Set(applied.rows.map((r) => r.name));
      const files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query(
            'insert into schema_migrations (name) values ($1)',
            [file],
          );
          await client.query('commit');
          this.log.log(`Applied migration ${file}`);
        } catch (err) {
          await client.query('rollback');
          throw err;
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]);
      client.release();
    }
  }
}
