import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { hashPassword } from './auth/passwords';
import { config } from './config';
import { DbService } from './db/db.service';

/**
 * Creates the first administrator from SEED_OWNER_EMAIL and
 * SEED_OWNER_PASSWORD. It runs only while no administrator exists.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly log = new Logger(SeedService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    const { email, password } = config.seed;
    if (!email || !password) return;

    const admins = await this.db.query(
      `select 1 from users where role = 'admin' limit 1`,
    );
    if (admins.rowCount !== 0) return;

    const passwordHash = await hashPassword(password);
    await this.db.tx(async (client) => {
      const existing = await client.query<{
        id: string;
        role: string;
        verified: boolean;
      }>(
        `select id, role, (email_verified_at is not null) as verified
         from users where email = $1 for update`,
        [email],
      );
      let id = existing.rows[0]?.id;
      if (id && existing.rows[0].verified) {
        await client.query(
          `update users set role = 'admin', status = 'active' where id = $1`,
          [id],
        );
      } else if (id) {
        // Nobody proved they own this mailbox, so whoever signed up with it
        // does not get to keep the account.
        await client.query(
          `update users
           set role = 'admin', status = 'active', password_hash = $2,
               must_change_password = true, email_verified_at = now()
           where id = $1`,
          [id, passwordHash],
        );
        await client.query('delete from sessions where user_id = $1', [id]);
      } else {
        // The seed password is a starting point, so it must be changed at first sign-in.
        const inserted = await client.query<{ id: string }>(
          `insert into users
             (email, password_hash, full_name, role, email_verified_at,
              must_change_password)
           values ($1, $2, 'Site Administrator', 'admin', now(), true)
           returning id`,
          [email, passwordHash],
        );
        id = inserted.rows[0].id;
      }
      await this.audit.record(client, {
        actorId: null,
        action: 'user.seeded_admin',
        objectType: 'user',
        objectId: id,
        priorState: existing.rows[0]?.role ?? null,
        newState: 'admin',
        reason: 'SEED_OWNER_EMAIL',
      });
    });
    this.log.log(`Created the first administrator: ${email}`);
  }
}
