import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { TokensService } from '../auth/tokens.service';
import { CatalogService } from '../catalog/catalog.service';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  InviteDto,
  PublishPolicyDto,
  UpdateCategoryDto,
  UpdateUserDto,
} from './admin.dto';

const INVITE_HOURS = 7 * 24;

const ROLE_NAMES: Record<string, string> = {
  requester: 'a requester',
  angel: 'an Angel',
  reviewer: 'a case reviewer',
  senior_reviewer: 'a senior reviewer',
  payment_approver: 'a payment approver',
  editor: 'an editor',
  prayer_team: 'a member of the prayer team',
  pastor: 'a pastor',
  auditor: 'an auditor',
  admin: 'an administrator',
};

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly catalog: CatalogService,
  ) {}

  async overview() {
    const [users, cases, identity, invites] = await Promise.all([
      this.db.query<{ role: string; n: number }>(
        `select role, count(*)::int as n from users
         where status = 'active' group by role`,
      ),
      this.db.query<{ state: string; n: number }>(
        'select state, count(*)::int as n from cases group by state',
      ),
      this.db.query<{ n: number }>(
        `select count(*)::int as n from identity_documents
         where status = 'pending'`,
      ),
      this.db.query<{ n: number }>(
        `select count(*)::int as n from auth_tokens
         where kind = 'invite' and used_at is null and revoked_at is null
           and expires_at > now()`,
      ),
    ]);
    return {
      usersByRole: Object.fromEntries(users.rows.map((r) => [r.role, r.n])),
      casesByState: Object.fromEntries(cases.rows.map((r) => [r.state, r.n])),
      pendingIdentityChecks: identity.rows[0].n,
      pendingInvites: invites.rows[0].n,
      mailProvider: config.mail.provider,
      storage: config.storage.bucket ? 's3' : 'local',
    };
  }

  async users(search: string | undefined, role: string | undefined) {
    const found = await this.db.query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      status: string;
      email_verified_at: Date | null;
      identity_status: string;
      must_change_password: boolean;
      created_at: Date;
      last_seen: Date | null;
    }>(
      `select u.id, u.email, u.full_name, u.role, u.status,
              u.email_verified_at, u.identity_status,
              u.must_change_password, u.created_at,
              (select max(s.created_at) from sessions s
               where s.user_id = u.id) as last_seen
       from users u
       where ($1::text is null
              or u.email ilike '%' || $1 || '%'
              or u.full_name ilike '%' || $1 || '%')
         and ($2::text is null or u.role = $2)
       order by u.created_at desc limit 200`,
      [search?.trim() || null, role || null],
    );
    return found.rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      status: u.status,
      emailVerified: u.email_verified_at !== null,
      identityStatus: u.identity_status,
      mustChangePassword: u.must_change_password,
      createdAt: u.created_at,
      lastSignIn: u.last_seen,
    }));
  }

  async updateUser(admin: SessionUser, userId: string, dto: UpdateUserDto) {
    if (userId === admin.id) {
      // Keeps the last administrator from locking everyone out.
      throw new ForbiddenException(
        'You cannot change your own role or turn off your own account.',
      );
    }
    if (dto.role === undefined && dto.status === undefined) {
      throw new BadRequestException('Nothing to change.');
    }
    await this.db.tx(async (client) => {
      const found = await client.query<{ role: string; status: string }>(
        'select role, status from users where id = $1 for update',
        [userId],
      );
      const before = found.rows[0];
      if (!before) throw new NotFoundException('We could not find that person.');

      if (dto.role && dto.role !== before.role) {
        await client.query('update users set role = $2 where id = $1', [
          userId,
          dto.role,
        ]);
        await this.audit.record(client, {
          actorId: admin.id,
          action: 'user.role_changed',
          objectType: 'user',
          objectId: userId,
          priorState: before.role,
          newState: dto.role,
        });
      }
      if (dto.status && dto.status !== before.status) {
        await client.query('update users set status = $2 where id = $1', [
          userId,
          dto.status,
        ]);
        if (dto.status === 'disabled') {
          await client.query('delete from sessions where user_id = $1', [
            userId,
          ]);
        }
        await this.audit.record(client, {
          actorId: admin.id,
          action:
            dto.status === 'disabled' ? 'user.disabled' : 'user.enabled',
          objectType: 'user',
          objectId: userId,
          priorState: before.status,
          newState: dto.status,
        });
      }
    });
  }

  async invites() {
    const found = await this.db.query<{
      id: string;
      email: string;
      role: string;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
      created_at: Date;
      inviter: string | null;
    }>(
      `select t.id, t.email, t.role, t.expires_at, t.used_at, t.revoked_at,
              t.created_at, u.full_name as inviter
       from auth_tokens t left join users u on u.id = t.created_by
       where t.kind = 'invite' order by t.created_at desc limit 200`,
    );
    const now = Date.now();
    return found.rows.map((t) => ({
      id: t.id,
      email: t.email,
      role: t.role,
      invitedBy: t.inviter,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      status: t.used_at
        ? 'accepted'
        : t.revoked_at
          ? 'cancelled'
          : t.expires_at.getTime() < now
            ? 'expired'
            : 'pending',
    }));
  }

  async invite(admin: SessionUser, dto: InviteDto) {
    const email = dto.email.toLowerCase();
    const issued = await this.db.tx(async (client) => {
      const existing = await client.query(
        'select 1 from users where email = $1',
        [email],
      );
      if (existing.rowCount !== 0) {
        throw new ConflictException(
          'This person already has an account. Change their role under People.',
        );
      }
      const token = await this.tokens.issue(client, {
        kind: 'invite',
        email,
        role: dto.role,
        createdBy: admin.id,
        hours: INVITE_HOURS,
      });
      await this.audit.record(client, {
        actorId: admin.id,
        action: 'invite.created',
        objectType: 'invite',
        objectId: token.id,
        newState: dto.role,
        reason: email,
      });
      return token;
    });

    const link = `${config.webUrl}/invite#${issued.token}`;
    const mail = await this.mail.send({
      to: email,
      subject: 'You are invited to Faceless Angels',
      paragraphs: [
        `${admin.fullName} invited you to join Faceless Angels as ${ROLE_NAMES[dto.role]}.`,
        'Use the link to choose your password. It works for 7 days and only once.',
      ],
      action: { label: 'Accept the invitation', url: link },
      idempotencyKey: `invite-${issued.id}`,
    });

    // The link is returned once so the admin can pass it on if email fails.
    return {
      id: issued.id,
      email,
      role: dto.role,
      expiresAt: issued.expires_at,
      link,
      emailSent: mail.sent,
    };
  }

  async revokeInvite(admin: SessionUser, inviteId: string) {
    await this.db.tx(async (client) => {
      const revoked = await client.query<{ email: string }>(
        `update auth_tokens set revoked_at = now()
         where id = $1 and kind = 'invite' and used_at is null
           and revoked_at is null
         returning email`,
        [inviteId],
      );
      if (!revoked.rows[0]) {
        throw new ConflictException(
          'This invitation was already used or cancelled.',
        );
      }
      await this.audit.record(client, {
        actorId: admin.id,
        action: 'invite.revoked',
        objectType: 'invite',
        objectId: inviteId,
        reason: revoked.rows[0].email,
      });
    });
  }

  categories() {
    return this.catalog.categories(true);
  }

  async updateCategory(
    admin: SessionUser,
    key: string,
    dto: UpdateCategoryDto,
  ) {
    await this.db.tx(async (client) => {
      const before = await this.catalog.category(client, key);
      if (!before) throw new NotFoundException('We could not find that need type.');

      const after = {
        label: dto.label?.trim() ?? before.label,
        description: dto.description?.trim() ?? before.description,
        enabled: dto.enabled ?? before.enabled,
        maxAmountCents: dto.maxAmountCents ?? before.maxAmountCents,
        quickMaxCents:
          dto.quickMaxCents === undefined
            ? before.quickMaxCents
            : dto.quickMaxCents,
        requiresDocument: dto.requiresDocument ?? before.requiresDocument,
      };
      if (
        after.quickMaxCents !== null &&
        after.quickMaxCents > after.maxAmountCents
      ) {
        throw new BadRequestException(
          'The small-request limit cannot be more than the full limit.',
        );
      }
      await client.query(
        `update need_categories
         set label = $2, description = $3, enabled = $4,
             max_amount_cents = $5, quick_max_cents = $6,
             requires_document = $7
         where key = $1`,
        [
          key,
          after.label,
          after.description,
          after.enabled,
          after.maxAmountCents,
          after.quickMaxCents,
          after.requiresDocument,
        ],
      );
      const { sort: _sort, key: _key, ...old } = before;
      await this.audit.record(client, {
        actorId: admin.id,
        action: 'category.updated',
        objectType: 'category',
        objectKey: key,
        priorState: JSON.stringify(old),
        newState: JSON.stringify(after),
      });
    });
  }

  async policyTexts() {
    const found = await this.db.query<{
      id: string;
      kind: string;
      version: number;
      body: string;
      created_at: Date;
      author: string | null;
    }>(
      `select p.id, p.kind, p.version, p.body, p.created_at,
              u.full_name as author
       from policy_texts p left join users u on u.id = p.created_by
       order by p.kind, p.version desc`,
    );
    return found.rows.map((p) => ({
      id: p.id,
      kind: p.kind,
      version: p.version,
      body: p.body,
      createdAt: p.created_at,
      author: p.author,
    }));
  }

  async publishPolicy(admin: SessionUser, dto: PublishPolicyDto) {
    await this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string; version: number }>(
        `insert into policy_texts (kind, version, body, created_by)
         select $1, coalesce(max(version), 0) + 1, $2, $3
         from policy_texts where kind = $1
         returning id, version`,
        [dto.kind, dto.body.trim(), admin.id],
      );
      await this.audit.record(client, {
        actorId: admin.id,
        action: 'policy.published',
        objectType: 'policy_text',
        objectId: inserted.rows[0].id,
        newState: `${dto.kind} v${inserted.rows[0].version}`,
      });
    });
  }

  async auditLog(query: { action?: string; before?: number; limit?: number }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const found = await this.db.query<{
      id: string;
      action: string;
      object_type: string;
      object_id: string | null;
      object_key: string | null;
      prior_state: string | null;
      new_state: string | null;
      reason: string | null;
      created_at: Date;
      actor: string | null;
      case_ref: string | null;
      subject: string | null;
    }>(
      `select a.id, a.action, a.object_type, a.object_id, a.object_key,
              a.prior_state, a.new_state, a.reason, a.created_at,
              u.full_name as actor, c.public_ref as case_ref,
              su.email as subject
       from audit_events a
       left join users u on u.id = a.actor_id
       left join cases c on a.object_type = 'case' and c.id = a.object_id
       left join users su on a.object_type = 'user' and su.id = a.object_id
       where ($1::text is null or a.action like $1 || '%')
         and ($2::bigint is null or a.id < $2)
       order by a.id desc limit $3`,
      [query.action?.trim() || null, query.before ?? null, limit],
    );
    return found.rows.map((a) => ({
      id: Number(a.id),
      action: a.action,
      objectType: a.object_type,
      object: a.case_ref ?? a.subject ?? a.object_key ?? a.object_id,
      priorState: a.prior_state,
      newState: a.new_state,
      reason: a.reason,
      by: a.actor,
      at: a.created_at,
    }));
  }
}
