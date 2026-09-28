import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Queryable } from '../db/db.service';

export type TokenKind = 'invite' | 'email_verify' | 'password_reset';

export interface TokenRow {
  id: string;
  kind: TokenKind;
  email: string;
  user_id: string | null;
  role: string | null;
  created_by: string | null;
  expires_at: Date;
}

const TOKEN_COLUMNS =
  'id, kind, email, user_id, role, created_by, expires_at';

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

const INVALID =
  'This link is no longer valid. It may have expired or been used already.';

@Injectable()
export class TokensService {
  /** Makes a one-time link token. Any earlier unused one for the same email is cancelled. */
  async issue(
    client: Queryable,
    input: {
      kind: TokenKind;
      email: string;
      hours: number;
      userId?: string;
      role?: string;
      createdBy?: string;
    },
  ) {
    await client.query(
      `update auth_tokens set revoked_at = now()
       where kind = $1 and email = $2 and used_at is null
         and revoked_at is null`,
      [input.kind, input.email],
    );
    const token = randomBytes(32).toString('base64url');
    const inserted = await client.query<{ id: string; expires_at: Date }>(
      `insert into auth_tokens
         (kind, email, user_id, role, token_hash, created_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
       returning id, expires_at`,
      [
        input.kind,
        input.email,
        input.userId ?? null,
        input.role ?? null,
        hashToken(token),
        input.createdBy ?? null,
        input.hours,
      ],
    );
    return { token, ...inserted.rows[0] };
  }

  async peek(client: Queryable, kind: TokenKind, token: string) {
    const found = await client.query<TokenRow>(
      `select ${TOKEN_COLUMNS} from auth_tokens
       where kind = $1 and token_hash = $2 and used_at is null
         and revoked_at is null and expires_at > now()`,
      [kind, hashToken(token)],
    );
    if (!found.rows[0]) throw new BadRequestException(INVALID);
    return found.rows[0];
  }

  /** Marks the token used. Call inside the transaction that acts on it. */
  async consume(client: Queryable, kind: TokenKind, token: string) {
    const used = await client.query<TokenRow>(
      `update auth_tokens set used_at = now()
       where kind = $1 and token_hash = $2 and used_at is null
         and revoked_at is null and expires_at > now()
       returning ${TOKEN_COLUMNS}`,
      [kind, hashToken(token)],
    );
    if (!used.rows[0]) throw new BadRequestException(INVALID);
    return used.rows[0];
  }
}
