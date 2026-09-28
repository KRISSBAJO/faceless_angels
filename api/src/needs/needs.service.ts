import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';

interface NeedRow {
  id: string;
  requester_id: string;
  requester_email: string;
  requester_name: string;
  public_ref: string;
  kind: string;
  category: string;
  category_label: string;
  city: string;
  region: string;
  public_summary: string;
  visibility: string;
  due_date: string | null;
  published_at: Date;
  approved_amount_cents: number;
  expires_on: string;
  pledged_cents: number;
  angels: number;
  identity_status: string;
  checks: { claim: string; result: string }[] | null;
}

// Listed needs only, with the approval still in date. The second parameter
// lets Angels whose identity is confirmed see the private ones too.
const NEED_SQL = `
  select c.id, c.requester_id, u.email as requester_email,
         u.full_name as requester_name, c.public_ref, c.kind, c.category,
         nc.label as category_label, c.city, c.region, c.public_summary,
         c.visibility, to_char(c.due_date, 'YYYY-MM-DD') as due_date,
         c.published_at, d.approved_amount_cents,
         to_char(d.expires_on, 'YYYY-MM-DD') as expires_on,
         coalesce((select sum(p.amount_cents) from pledges p
                   where p.case_id = c.id and p.status = 'active'), 0)::int
           as pledged_cents,
         (select count(distinct p.angel_id)::int from pledges p
          where p.case_id = c.id and p.status = 'active') as angels,
         u.identity_status,
         (select json_agg(json_build_object('claim', v.claim, 'result', v.result))
          from (select distinct on (claim) claim, result
                from verification_checks where case_id = c.id
                order by claim, created_at desc) v) as checks
  from cases c
  join users u on u.id = c.requester_id
  join need_categories nc on nc.key = c.category
  join lateral (
    select approved_amount_cents, expires_on from decisions
    where case_id = c.id and outcome = 'approved'
    order by decided_at desc limit 1
  ) d on true
  where c.state = 'published' and d.expires_on >= current_date
    and (c.visibility = 'public' or $1)`;

const SUPPORTED = ['document_supported', 'independently_confirmed'];

/** Each badge names one check that was really done. There is no blanket "verified". */
function badges(row: NeedRow) {
  const found = new Map((row.checks ?? []).map((c) => [c.claim, c.result]));
  const list: string[] = [];
  if (row.identity_status === 'verified') list.push('Identity checked');
  if (SUPPORTED.includes(found.get('document') ?? '')) {
    list.push('Document reviewed');
  }
  if (found.get('current_balance') === 'independently_confirmed') {
    list.push('Current balance confirmed with provider');
  }
  if (SUPPORTED.includes(found.get('provider_payment') ?? '')) {
    list.push('Provider can be paid directly');
  }
  return list;
}

function toNeed(row: NeedRow, viewer: SessionUser | undefined) {
  return {
    ref: row.public_ref,
    kind: row.kind,
    category: row.category,
    categoryLabel: row.category_label,
    city: row.city,
    region: row.region,
    summary: row.public_summary,
    visibility: row.visibility,
    dueDate: row.due_date,
    listedAt: row.published_at,
    expiresOn: row.expires_on,
    amountCents: row.approved_amount_cents,
    pledgedCents: Math.min(row.pledged_cents, row.approved_amount_cents),
    remainingCents: Math.max(row.approved_amount_cents - row.pledged_cents, 0),
    angels: row.angels,
    badges: badges(row),
    isYours: viewer?.id === row.requester_id,
  };
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
  })}`;
}

@Injectable()
export class NeedsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private seesPrivate(viewer: SessionUser | undefined) {
    return viewer?.identityStatus === 'verified';
  }

  async list(viewer: SessionUser | undefined, category?: string) {
    const found = await this.db.query<NeedRow>(
      `${NEED_SQL} and ($2::text is null or c.category = $2)
       order by (d.approved_amount_cents <= coalesce((
                  select sum(p.amount_cents) from pledges p
                  where p.case_id = c.id and p.status = 'active'), 0)),
                c.due_date nulls last, c.published_at`,
      [this.seesPrivate(viewer), category || null],
    );
    return found.rows.map((row) => toNeed(row, viewer));
  }

  async get(viewer: SessionUser | undefined, ref: string) {
    const row = await this.find(this.db, viewer, ref);
    return toNeed(row, viewer);
  }

  async pledge(angel: SessionUser, ref: string, amountCents: number) {
    if (!angel.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you pledge.',
        code: 'email_not_verified',
      });
    }
    const result = await this.db.tx(async (client) => {
      const row = await this.find(client, angel, ref, true);
      if (row.requester_id === angel.id) {
        throw new ForbiddenException('You cannot pledge to your own request.');
      }
      const remaining = row.approved_amount_cents - row.pledged_cents;
      if (remaining <= 0) {
        throw new ConflictException('This need is already fully pledged.');
      }
      if (amountCents > remaining) {
        throw new BadRequestException(
          `Only ${dollars(remaining)} is still needed. Pledge that much or less.`,
        );
      }
      await client.query(
        `update users set angel_ref = 'FA-A' || nextval('angel_ref_seq')
         where id = $1 and angel_ref is null`,
        [angel.id],
      );
      const inserted = await client.query<{ id: string }>(
        `insert into pledges (case_id, angel_id, amount_cents)
         values ($1, $2, $3) returning id`,
        [row.id, angel.id, amountCents],
      );
      await this.audit.record(client, {
        actorId: angel.id,
        action: 'pledge.made',
        objectType: 'case',
        objectId: row.id,
        newState: String(amountCents),
        reason: inserted.rows[0].id,
      });
      return { row, covered: amountCents === remaining };
    });

    // The requester learns that help was pledged, never by whom.
    await this.mail.send({
      to: result.row.requester_email,
      subject: result.covered
        ? `Your need is fully pledged (${result.row.public_ref})`
        : `A Faceless Angel pledged toward your need (${result.row.public_ref})`,
      paragraphs: [
        `Hello ${result.row.requester_name},`,
        result.covered
          ? 'Faceless Angels have now pledged the full amount of your need.'
          : `A Faceless Angel pledged ${dollars(amountCents)} toward your need.`,
        'A pledge is a promise to give. We will tell you when the provider has been paid.',
      ],
      action: {
        label: 'Open my request',
        url: `${config.webUrl}/requests/${result.row.id}`,
      },
    });
    return this.get(angel, ref);
  }

  async giving(angel: SessionUser) {
    const [profile, pledges] = await Promise.all([
      this.db.query<{ angel_ref: string | null; created_at: Date }>(
        'select angel_ref, created_at from users where id = $1',
        [angel.id],
      ),
      this.db.query<{
        id: string;
        amount_cents: number;
        status: string;
        ended_reason: string | null;
        created_at: Date;
        public_ref: string;
        category_label: string;
        city: string;
        region: string;
        public_summary: string | null;
        case_state: string;
      }>(
        `select p.id, p.amount_cents, p.status, p.ended_reason, p.created_at,
                c.public_ref, nc.label as category_label, c.city, c.region,
                c.public_summary, c.state as case_state
         from pledges p
         join cases c on c.id = p.case_id
         join need_categories nc on nc.key = c.category
         where p.angel_id = $1 order by p.created_at desc`,
        [angel.id],
      ),
    ]);
    const active = pledges.rows.filter((p) => p.status === 'active');
    return {
      angelRef: profile.rows[0].angel_ref,
      memberSince: profile.rows[0].created_at,
      identityStatus: angel.identityStatus,
      activePledgedCents: active.reduce((sum, p) => sum + p.amount_cents, 0),
      needsPledgedTo: new Set(active.map((p) => p.public_ref)).size,
      pledges: pledges.rows.map((p) => ({
        id: p.id,
        amountCents: p.amount_cents,
        status: p.status,
        endedReason: p.ended_reason,
        at: p.created_at,
        need: {
          ref: p.public_ref,
          categoryLabel: p.category_label,
          city: p.city,
          region: p.region,
          summary: p.public_summary,
          listed: p.case_state === 'published',
        },
      })),
    };
  }

  async withdrawPledge(angel: SessionUser, pledgeId: string) {
    await this.db.tx(async (client) => {
      const ended = await client.query<{ case_id: string; amount_cents: number }>(
        `update pledges
         set status = 'withdrawn', ended_reason = 'Withdrawn by the Angel',
             ended_at = now()
         where id = $1 and angel_id = $2 and status = 'active'
         returning case_id, amount_cents`,
        [pledgeId, angel.id],
      );
      if (!ended.rows[0]) {
        throw new ConflictException('This pledge is no longer active.');
      }
      await this.audit.record(client, {
        actorId: angel.id,
        action: 'pledge.withdrawn',
        objectType: 'case',
        objectId: ended.rows[0].case_id,
        priorState: String(ended.rows[0].amount_cents),
        reason: pledgeId,
      });
    });
  }

  // A need the viewer may not see reads as missing, so refs cannot be probed.
  private async find(
    client: Queryable,
    viewer: SessionUser | undefined,
    ref: string,
    lock = false,
  ) {
    if (lock) {
      // Serialises pledges on one need so two cannot both take the last dollars.
      await client.query(
        'select 1 from cases where public_ref = $1 for update',
        [ref],
      );
    }
    const found = await client.query<NeedRow>(
      `${NEED_SQL} and c.public_ref = $2`,
      [this.seesPrivate(viewer), ref],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException('We could not find that need.');
    return row;
  }
}
