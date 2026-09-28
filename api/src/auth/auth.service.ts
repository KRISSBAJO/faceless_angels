import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  assertAcceptablePassword,
  hashPassword,
  verifyPassword,
} from './passwords';
import { hashToken, TokensService } from './tokens.service';

export const SESSION_DAYS = 14;
const VERIFY_HOURS = 48;
const RESET_HOURS = 2;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  identityStatus: string;
  mustChangePassword: boolean;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  email_verified_at: Date | null;
  identity_status: string;
  must_change_password: boolean;
  password_hash: string;
}

const USER_COLUMNS = `u.id, u.email, u.full_name, u.role, u.status,
  u.email_verified_at, u.identity_status, u.must_change_password`;

function toUser(row: Omit<UserRow, 'password_hash'>): SessionUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
    identityStatus: row.identity_status,
    mustChangePassword: row.must_change_password,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  async signUp(
    emailInput: string,
    password: string,
    fullName: string,
    role: 'requester' | 'angel',
  ) {
    const email = emailInput.toLowerCase();
    assertAcceptablePassword(password, email);
    const passwordHash = await hashPassword(password);

    const { user, token } = await this.db.tx(async (client) => {
      const inserted = await client.query<UserRow>(
        `insert into users as u (email, password_hash, full_name, role)
         values ($1, $2, $3, $4)
         on conflict (email) do nothing
         returning ${USER_COLUMNS}`,
        [email, passwordHash, fullName.trim(), role],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new ConflictException(
          'An account with this email already exists. Sign in instead.',
        );
      }
      await this.audit.record(client, {
        actorId: row.id,
        action: 'user.created',
        objectType: 'user',
        objectId: row.id,
      });
      const issued = await this.tokens.issue(client, {
        kind: 'email_verify',
        email,
        userId: row.id,
        hours: VERIFY_HOURS,
      });
      return { user: toUser(row), token: issued.token };
    });

    await this.sendVerification(user, token);
    return user;
  }

  async signIn(email: string, password: string) {
    const found = await this.db.query<UserRow>(
      `select ${USER_COLUMNS}, u.password_hash from users u
       where u.email = $1`,
      [email.toLowerCase()],
    );
    const row = found.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new UnauthorizedException('The email or password is incorrect.');
    }
    if (row.status !== 'active') {
      throw new ForbiddenException(
        'This account has been turned off. Contact an administrator.',
      );
    }
    return toUser(row);
  }

  async createSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() + make_interval(days => $3))`,
      [userId, hashToken(token), SESSION_DAYS],
    );
    return token;
  }

  async userForToken(token: string): Promise<SessionUser | null> {
    const found = await this.db.query<UserRow>(
      `select ${USER_COLUMNS}
       from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()
         and u.status = 'active'`,
      [hashToken(token)],
    );
    return found.rows[0] ? toUser(found.rows[0]) : null;
  }

  async endSession(token: string) {
    await this.db.query('delete from sessions where token_hash = $1', [
      hashToken(token),
    ]);
  }

  async resendVerification(user: SessionUser) {
    if (user.emailVerified) return;
    const issued = await this.tokens.issue(this.db, {
      kind: 'email_verify',
      email: user.email,
      userId: user.id,
      hours: VERIFY_HOURS,
    });
    await this.sendVerification(user, issued.token);
  }

  verifyEmail(token: string) {
    return this.db.tx(async (client) => {
      const used = await this.tokens.consume(client, 'email_verify', token);
      await client.query(
        `update users set email_verified_at = coalesce(email_verified_at, now())
         where id = $1`,
        [used.user_id],
      );
      await this.audit.record(client, {
        actorId: used.user_id,
        action: 'user.email_verified',
        objectType: 'user',
        objectId: used.user_id,
      });
    });
  }

  /** Always succeeds, so the response never reveals which emails have accounts. */
  async forgotPassword(emailInput: string) {
    const email = emailInput.toLowerCase();
    const found = await this.db.query<{ id: string }>(
      `select id from users where email = $1 and status = 'active'`,
      [email],
    );
    const user = found.rows[0];
    if (!user) return;
    const issued = await this.tokens.issue(this.db, {
      kind: 'password_reset',
      email,
      userId: user.id,
      hours: RESET_HOURS,
    });
    await this.mail.send({
      to: email,
      subject: 'Reset your Faceless Angels password',
      paragraphs: [
        'Someone asked to reset the password for this account.',
        `The link works for ${RESET_HOURS} hours. If you did not ask for it, you can ignore this email.`,
      ],
      action: {
        label: 'Choose a new password',
        url: `${config.webUrl}/reset-password#${issued.token}`,
      },
      idempotencyKey: `reset-${issued.id}`,
    });
  }

  async resetPassword(token: string, password: string) {
    const peeked = await this.tokens.peek(this.db, 'password_reset', token);
    assertAcceptablePassword(password, peeked.email);
    const passwordHash = await hashPassword(password);
    await this.db.tx(async (client) => {
      const used = await this.tokens.consume(client, 'password_reset', token);
      // Opening the link proves they hold the mailbox.
      await client.query(
        `update users
         set password_hash = $2, must_change_password = false,
             email_verified_at = coalesce(email_verified_at, now())
         where id = $1`,
        [used.user_id, passwordHash],
      );
      await client.query('delete from sessions where user_id = $1', [
        used.user_id,
      ]);
      await this.audit.record(client, {
        actorId: used.user_id,
        action: 'user.password_reset',
        objectType: 'user',
        objectId: used.user_id,
      });
    });
  }

  async changePassword(
    user: SessionUser,
    current: string,
    next: string,
    sessionToken: string,
  ) {
    const found = await this.db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [user.id],
    );
    if (!(await verifyPassword(current, found.rows[0].password_hash))) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    if (current === next) {
      throw new BadRequestException(
        'Choose a password that is different from your current one.',
      );
    }
    assertAcceptablePassword(next, user.email);
    const passwordHash = await hashPassword(next);
    await this.db.tx(async (client) => {
      await client.query(
        `update users set password_hash = $2, must_change_password = false
         where id = $1`,
        [user.id, passwordHash],
      );
      // Sign out every other device.
      await client.query(
        'delete from sessions where user_id = $1 and token_hash <> $2',
        [user.id, hashToken(sessionToken)],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'user.password_changed',
        objectType: 'user',
        objectId: user.id,
      });
    });
  }

  async inviteInfo(token: string) {
    const invite = await this.tokens.peek(this.db, 'invite', token);
    return { email: invite.email, role: invite.role };
  }

  async acceptInvite(token: string, fullName: string, password: string) {
    const peeked = await this.tokens.peek(this.db, 'invite', token);
    assertAcceptablePassword(password, peeked.email);
    const passwordHash = await hashPassword(password);
    return this.db.tx(async (client) => {
      const invite = await this.tokens.consume(client, 'invite', token);
      const inserted = await client.query<UserRow>(
        `insert into users as u
           (email, password_hash, full_name, role, email_verified_at,
            invited_by)
         values ($1, $2, $3, $4, now(), $5)
         on conflict (email) do nothing
         returning ${USER_COLUMNS}`,
        [
          invite.email,
          passwordHash,
          fullName.trim(),
          invite.role,
          invite.created_by,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new ConflictException(
          'An account with this email already exists. Sign in instead.',
        );
      }
      await this.audit.record(client, {
        actorId: row.id,
        action: 'invite.accepted',
        objectType: 'user',
        objectId: row.id,
        newState: row.role,
      });
      return toUser(row);
    });
  }

  async loadUser(client: Queryable, userId: string) {
    const found = await client.query<UserRow>(
      `select ${USER_COLUMNS} from users u where u.id = $1`,
      [userId],
    );
    return toUser(found.rows[0]);
  }

  private sendVerification(user: SessionUser, token: string) {
    return this.mail.send({
      to: user.email,
      subject: 'Confirm your email for Faceless Angels',
      paragraphs: [
        `Hello ${user.fullName},`,
        'Confirm your email so we can reach you about your request.',
        `The link works for ${VERIFY_HOURS} hours.`,
      ],
      action: {
        label: 'Confirm my email',
        url: `${config.webUrl}/verify-email#${token}`,
      },
    });
  }
}
