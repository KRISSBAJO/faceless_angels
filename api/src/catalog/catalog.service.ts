import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../db/db.service';

export interface Category {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  maxAmountCents: number;
  quickMaxCents: number | null;
  requiresDocument: boolean;
  sort: number;
}

interface CategoryRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  max_amount_cents: number;
  quick_max_cents: number | null;
  requires_document: boolean;
  sort: number;
}

export interface PolicyText {
  id: string;
  kind: string;
  version: number;
  body: string;
  createdAt: Date;
}

export const POLICY_KINDS = ['consent', 'attestation'] as const;

function toCategory(row: CategoryRow): Category {
  return {
    key: row.key,
    label: row.label,
    description: row.description,
    enabled: row.enabled,
    maxAmountCents: row.max_amount_cents,
    quickMaxCents: row.quick_max_cents,
    requiresDocument: row.requires_document,
    sort: row.sort,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService) {}

  async categories(includeDisabled = false) {
    const found = await this.db.query<CategoryRow>(
      `select * from need_categories
       where enabled or $1 order by sort, label`,
      [includeDisabled],
    );
    return found.rows.map(toCategory);
  }

  async category(client: Queryable, key: string) {
    const found = await client.query<CategoryRow>(
      'select * from need_categories where key = $1',
      [key],
    );
    return found.rows[0] ? toCategory(found.rows[0]) : null;
  }

  /** The newest wording of each agreement. */
  async currentTexts(client: Queryable = this.db) {
    const found = await client.query<{
      id: string;
      kind: string;
      version: number;
      body: string;
      created_at: Date;
    }>(
      `select distinct on (kind) id, kind, version, body, created_at
       from policy_texts order by kind, version desc`,
    );
    const texts = new Map<string, PolicyText>();
    for (const row of found.rows) {
      texts.set(row.kind, {
        id: row.id,
        kind: row.kind,
        version: row.version,
        body: row.body,
        createdAt: row.created_at,
      });
    }
    return {
      consent: texts.get('consent')!,
      attestation: texts.get('attestation')!,
    };
  }
}
