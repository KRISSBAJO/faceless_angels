import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { VaultService } from '../storage/vault.service';
import {
  AddCheckDto,
  DecisionDto,
  POLICY_VERSION,
  PublishDto,
} from './review.dto';

const OPEN_STATES = [
  'submitted',
  'in_review',
  'needs_more_information',
  'appealed',
  'approved',
  'published',
];

/** Returns what in a public summary could point to the requester, or null. */
function identifyingText(summary: string, name: string, email: string) {
  const text = summary.toLowerCase();
  if (text.includes('@')) return 'an email address';
  if (/\d{5,}/.test(summary)) return 'a long number';
  const fullName = name.trim().toLowerCase();
  const lastName = fullName.split(/\s+/).at(-1) ?? '';
  const mailbox = email.split('@')[0].toLowerCase();
  const word = (w: string) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  if (fullName && text.includes(fullName)) return "the requester's name";
  if (lastName.length >= 3 && word(lastName)) return "the requester's name";
  if (mailbox.length >= 4 && word(mailbox)) return "the requester's email name";
  return null;
}

interface StaffCaseRow {
  id: string;
  public_ref: string;
  requester_id: string;
  assigned_reviewer_id: string | null;
  kind: string;
  category: string;
  category_label: string | null;
  state: string;
  what_happened: string;
  amount_requested_cents: number;
  due_date: string | null;
  provider_name: string | null;
  already_paid_cents: number;
  other_assistance_cents: number;
  other_assistance_note: string | null;
  consequence: string | null;
  recurrence: string | null;
  city: string;
  region: string;
  submitted_at: Date | null;
  requester_name: string;
  requester_email: string;
  requester_identity: string;
  requester_email_verified: boolean;
  reviewer_name: string | null;
  first_decided_by: string | null;
  listing_preference: string;
  visibility: string | null;
  public_summary: string | null;
  published_at: Date | null;
  approved_amount_cents: number | null;
  approval_expires_on: string | null;
  pledged_cents: number;
}

const STAFF_CASE_SQL = `
  select c.id, c.public_ref, c.requester_id, c.assigned_reviewer_id,
         c.kind, c.category, nc.label as category_label, c.state,
         c.what_happened, c.amount_requested_cents,
         to_char(c.due_date, 'YYYY-MM-DD') as due_date, c.provider_name,
         c.already_paid_cents, c.other_assistance_cents,
         c.other_assistance_note, c.consequence, c.recurrence, c.city,
         c.region, c.submitted_at,
         u.full_name as requester_name, u.email as requester_email,
         u.identity_status as requester_identity,
         (u.email_verified_at is not null) as requester_email_verified,
         r.full_name as reviewer_name,
         d.decided_by as first_decided_by,
         c.listing_preference, c.visibility, c.public_summary,
         c.published_at, ok.approved_amount_cents,
         to_char(ok.expires_on, 'YYYY-MM-DD') as approval_expires_on,
         coalesce((select sum(p.amount_cents) from pledges p
                   where p.case_id = c.id and p.status = 'active'), 0)::int
           as pledged_cents
  from cases c
  join users u on u.id = c.requester_id
  left join users r on r.id = c.assigned_reviewer_id
  left join need_categories nc on nc.key = c.category
  left join decisions d on d.case_id = c.id and d.kind = 'initial'
  left join lateral (
    select approved_amount_cents, expires_on from decisions
    where case_id = c.id and outcome = 'approved'
    order by decided_at desc limit 1
  ) ok on true`;

function summary(row: StaffCaseRow, userId: string) {
  return {
    id: row.id,
    publicRef: row.public_ref,
    kind: row.kind,
    category: row.category,
    categoryLabel: row.category_label ?? row.category,
    state: row.state,
    amountRequestedCents: row.amount_requested_cents,
    dueDate: row.due_date,
    providerName: row.provider_name,
    city: row.city,
    region: row.region,
    submittedAt: row.submitted_at,
    reviewerName: row.reviewer_name,
    assignedToMe: row.assigned_reviewer_id === userId,
    assigned: row.assigned_reviewer_id !== null,
    // The person who made the first decision may not decide the appeal.
    decidedByMe: row.first_decided_by === userId,
    approvedAmountCents: row.approved_amount_cents,
    pledgedCents: row.pledged_cents,
  };
}

@Injectable()
export class ReviewService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly vault: VaultService,
    private readonly mail: MailService,
  ) {}

  async queue(user: SessionUser) {
    const found = await this.db.query<StaffCaseRow>(
      `${STAFF_CASE_SQL}
       where c.state = any($1) and c.requester_id <> $2
       order by c.due_date nulls last, c.submitted_at`,
      [OPEN_STATES, user.id],
    );
    return found.rows.map((row) => summary(row, user.id));
  }

  async detail(user: SessionUser, caseId: string) {
    const row = await this.find(this.db, user, caseId);

    const [evidence, checks, messages, decisions, timeline, history] =
      await Promise.all([
        this.db.query<{
          id: string;
          kind: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at: Date;
          reused_on: string[] | null;
        }>(
          `select e.id, e.kind, e.original_name, e.mime_type, e.size_bytes,
                  e.uploaded_at,
                  (select array_agg(distinct oc.public_ref)
                   from need_evidence o join cases oc on oc.id = o.case_id
                   where o.sha256 = e.sha256 and o.case_id <> e.case_id
                  ) as reused_on
           from need_evidence e where e.case_id = $1 order by e.uploaded_at`,
          [caseId],
        ),
        this.db.query<{
          id: string;
          claim: string;
          result: string;
          method: string;
          note: string | null;
          actor_name: string;
          created_at: Date;
        }>(
          `select v.id, v.claim, v.result, v.method, v.note,
                  u.full_name as actor_name, v.created_at
           from verification_checks v join users u on u.id = v.actor_id
           where v.case_id = $1 order by v.created_at`,
          [caseId],
        ),
        this.db.query<{
          id: string;
          kind: string;
          body: string;
          author_name: string;
          created_at: Date;
        }>(
          `select m.id, m.kind, m.body, u.full_name as author_name,
                  m.created_at
           from case_messages m join users u on u.id = m.author_id
           where m.case_id = $1 order by m.created_at`,
          [caseId],
        ),
        this.db.query<{
          kind: string;
          outcome: string;
          approved_amount_cents: number | null;
          payment_destination: string | null;
          expires_on: string | null;
          reason_code: string | null;
          rationale: string;
          restrictions: string | null;
          policy_version: string;
          decider_name: string;
          decided_at: Date;
        }>(
          `select d.kind, d.outcome, d.approved_amount_cents,
                  d.payment_destination,
                  to_char(d.expires_on, 'YYYY-MM-DD') as expires_on,
                  d.reason_code, d.rationale, d.restrictions,
                  d.policy_version, u.full_name as decider_name, d.decided_at
           from decisions d join users u on u.id = d.decided_by
           where d.case_id = $1 order by d.decided_at`,
          [caseId],
        ),
        this.db.query<{
          action: string;
          prior_state: string | null;
          new_state: string | null;
          reason: string | null;
          actor_name: string | null;
          created_at: Date;
        }>(
          `select a.action, a.prior_state, a.new_state, a.reason,
                  u.full_name as actor_name, a.created_at
           from audit_events a left join users u on u.id = a.actor_id
           where a.object_type = 'case' and a.object_id = $1 order by a.id`,
          [caseId],
        ),
        this.db.query<{ n: number }>(
          `select count(*)::int as n from cases
           where requester_id = $1 and id <> $2 and state <> 'draft'
             and created_at > now() - interval '12 months'`,
          [row.requester_id, caseId],
        ),
      ]);

    // Staff reads of a case are logged, including this one.
    await this.audit.record(this.db, {
      actorId: user.id,
      action: 'case.viewed',
      objectType: 'case',
      objectId: caseId,
    });

    return {
      ...summary(row, user.id),
      whatHappened: row.what_happened,
      consequence: row.consequence,
      recurrence: row.recurrence,
      alreadyPaidCents: row.already_paid_cents,
      otherAssistanceCents: row.other_assistance_cents,
      otherAssistanceNote: row.other_assistance_note,
      requester: {
        name: row.requester_name,
        email: row.requester_email,
        identityStatus: row.requester_identity,
        emailVerified: row.requester_email_verified,
      },
      otherRequestsLast12Months: history.rows[0].n,
      listing: {
        preference: row.listing_preference,
        visibility: row.visibility,
        summary: row.public_summary,
        publishedAt: row.published_at,
        expiresOn: row.approval_expires_on,
      },
      evidence: evidence.rows.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.original_name,
        mimeType: e.mime_type,
        sizeBytes: e.size_bytes,
        uploadedAt: e.uploaded_at,
        reusedOn: e.reused_on ?? [],
      })),
      checks: checks.rows.map((v) => ({
        id: v.id,
        claim: v.claim,
        result: v.result,
        method: v.method,
        note: v.note,
        by: v.actor_name,
        at: v.created_at,
      })),
      messages: messages.rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        body: m.body,
        by: m.author_name,
        at: m.created_at,
      })),
      decisions: decisions.rows.map((d) => ({
        kind: d.kind,
        outcome: d.outcome,
        approvedAmountCents: d.approved_amount_cents,
        paymentDestination: d.payment_destination,
        expiresOn: d.expires_on,
        reasonCode: d.reason_code,
        rationale: d.rationale,
        restrictions: d.restrictions,
        policyVersion: d.policy_version,
        by: d.decider_name,
        at: d.decided_at,
      })),
      timeline: timeline.rows.map((t) => ({
        action: t.action,
        priorState: t.prior_state,
        state: t.new_state,
        reason: t.reason,
        by: t.actor_name,
        at: t.created_at,
      })),
    };
  }

  async openEvidence(user: SessionUser, caseId: string, evidenceId: string) {
    await this.find(this.db, user, caseId);
    const found = await this.db.query<{
      original_name: string;
      mime_type: string;
      storage: string;
      storage_key: string;
      encryption: string | null;
    }>(
      `select original_name, mime_type, storage, storage_key, encryption
       from need_evidence
       where id = $1 and case_id = $2`,
      [evidenceId, caseId],
    );
    const doc = found.rows[0];
    if (!doc) throw new NotFoundException('We could not find that document.');

    const bytes = await this.vault.get({
      storage: doc.storage,
      key: doc.storage_key,
      encryption: doc.encryption,
    });
    await this.audit.record(this.db, {
      actorId: user.id,
      action: 'evidence.viewed',
      objectType: 'case',
      objectId: caseId,
      reason: evidenceId,
    });
    return {
      name: doc.original_name,
      mimeType: doc.mime_type,
      bytes,
    };
  }

  claim(user: SessionUser, caseId: string) {
    return this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      if (row.assigned_reviewer_id) {
        throw new ConflictException(
          'Another reviewer already has this request.',
        );
      }
      if (row.state === 'appealed') {
        if (row.first_decided_by === user.id) {
          throw new ForbiddenException(
            'You made the first decision, so someone else must review the appeal.',
          );
        }
        return this.move(client, user, row, 'appealed', 'case.claimed', {
          assign: user.id,
        });
      }
      if (row.state !== 'submitted') {
        throw new ConflictException('This request is not waiting for review.');
      }
      return this.move(client, user, row, 'in_review', 'case.claimed', {
        assign: user.id,
      });
    });
  }

  release(user: SessionUser, caseId: string) {
    return this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireAssigned(row, user);
      const next = row.state === 'appealed' ? 'appealed' : 'submitted';
      if (row.state !== 'in_review' && row.state !== 'appealed') {
        throw new ConflictException(
          'You can only hand back a request that is in review.',
        );
      }
      return this.move(client, user, row, next, 'case.released', {
        assign: null,
      });
    });
  }

  addCheck(user: SessionUser, caseId: string, dto: AddCheckDto) {
    return this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireAssigned(row, user);
      this.requireState(row, ['in_review', 'appealed']);
      await client.query(
        `insert into verification_checks
           (case_id, claim, result, method, note, actor_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          caseId,
          dto.claim,
          dto.result,
          dto.method.trim(),
          dto.note?.trim() || null,
          user.id,
        ],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'check.recorded',
        objectType: 'case',
        objectId: caseId,
        newState: row.state,
        reason: `${dto.claim}: ${dto.result}`,
      });
    });
  }

  async requestInfo(user: SessionUser, caseId: string, message: string) {
    const { row, moved } = await this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireAssigned(row, user);
      this.requireState(row, ['in_review']);
      await client.query(
        `insert into case_messages (case_id, author_id, kind, body)
         values ($1, $2, 'info_request', $3)`,
        [caseId, user.id, message.trim()],
      );
      const moved = await this.move(
        client,
        user,
        row,
        'needs_more_information',
        'case.info_requested',
      );
      return { row, moved };
    });
    await this.notify(row, 'We have a question about your request');
    return moved;
  }

  async decide(user: SessionUser, caseId: string, dto: DecisionDto) {
    const { row, moved } = await this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireAssigned(row, user);
      this.requireState(row, ['in_review', 'appealed']);
      const kind = row.state === 'appealed' ? 'appeal' : 'initial';
      if (kind === 'appeal' && row.first_decided_by === user.id) {
        throw new ForbiddenException(
          'You made the first decision, so someone else must decide the appeal.',
        );
      }

      const approved = dto.outcome === 'approved';
      if (approved) {
        if (row.requester_identity !== 'verified') {
          throw new BadRequestException(
            "Confirm the requester's identity before you approve.",
          );
        }
        if (dto.approvedAmountCents! > row.amount_requested_cents) {
          throw new BadRequestException(
            'The approved amount cannot be more than the amount requested.',
          );
        }
        if (dto.expiresOn!.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
          throw new BadRequestException('Choose an expiry date in the future.');
        }
      }

      await client.query(
        `insert into decisions
           (case_id, kind, outcome, approved_amount_cents,
            payment_destination, expires_on, reason_code, rationale,
            restrictions, policy_version, decided_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          caseId,
          kind,
          dto.outcome,
          approved ? dto.approvedAmountCents : null,
          approved ? dto.paymentDestination!.trim() : null,
          approved ? dto.expiresOn!.slice(0, 10) : null,
          approved ? null : dto.reasonCode,
          dto.rationale.trim(),
          dto.restrictions?.trim() || null,
          POLICY_VERSION,
          user.id,
        ],
      );
      const moved = await this.move(
        client,
        user,
        row,
        dto.outcome,
        kind === 'appeal' ? 'appeal.decided' : 'case.decided',
        { reason: approved ? undefined : dto.reasonCode },
      );
      return { row, moved };
    });
    await this.notify(row, 'There is a decision on your request');
    return moved;
  }

  publish(user: SessionUser, caseId: string, dto: PublishDto) {
    return this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireOwnerOrAdmin(row, user);
      this.requireState(row, ['approved']);
      if (
        row.listing_preference === 'angels_only' &&
        dto.visibility === 'public'
      ) {
        throw new BadRequestException(
          'The requester asked for this need to be shown to confirmed Angels only.',
        );
      }
      const leak = identifyingText(
        dto.summary,
        row.requester_name,
        row.requester_email,
      );
      if (leak) {
        throw new BadRequestException(
          `The summary contains ${leak}. Rewrite it so it cannot point to the person.`,
        );
      }
      await client.query(
        `update cases
         set visibility = $2, public_summary = $3, published_at = now()
         where id = $1`,
        [caseId, dto.visibility, dto.summary.trim()],
      );
      return this.move(client, user, row, 'published', 'case.published', {
        reason: dto.visibility,
      });
    });
  }

  async unpublish(user: SessionUser, caseId: string, reason: string) {
    const { moved, row, angels } = await this.db.tx(async (client) => {
      const row = await this.find(client, user, caseId, true);
      this.requireOwnerOrAdmin(row, user);
      this.requireState(row, ['published']);
      const released = await client.query<{ email: string; full_name: string }>(
        `with ended as (
           update pledges
           set status = 'released', ended_at = now(),
               ended_reason = 'The need was taken off the list'
           where case_id = $1 and status = 'active'
           returning angel_id
         )
         select distinct u.email, u.full_name
         from ended join users u on u.id = ended.angel_id`,
        [caseId],
      );
      const moved = await this.move(
        client,
        user,
        row,
        'approved',
        'case.unpublished',
        { reason: reason.trim() },
      );
      return { moved, row, angels: released.rows };
    });
    for (const angel of angels) {
      await this.mail.send({
        to: angel.email,
        subject: `Your pledge was released (${row.public_ref})`,
        paragraphs: [
          `Hello ${angel.full_name},`,
          `The need ${row.public_ref} was taken off the list, so your pledge toward it was released. You owe nothing.`,
          'Thank you for being willing to help.',
        ],
        action: { label: 'See open needs', url: `${config.webUrl}/needs` },
      });
    }
    return moved;
  }

  // The email says only that something changed. Details stay behind sign-in.
  private notify(row: StaffCaseRow, subject: string) {
    return this.mail.send({
      to: row.requester_email,
      subject: `${subject} (${row.public_ref})`,
      paragraphs: [
        `Hello ${row.requester_name},`,
        `${subject}. Sign in to read it.`,
      ],
      action: {
        label: 'Open my request',
        url: `${config.webUrl}/requests/${row.id}`,
      },
    });
  }

  private async move(
    client: PoolClient,
    user: SessionUser,
    row: StaffCaseRow,
    state: string,
    action: string,
    options: { assign?: string | null; reason?: string } = {},
  ) {
    const assignee =
      options.assign === undefined ? row.assigned_reviewer_id : options.assign;
    await client.query(
      `update cases
       set state = $2, assigned_reviewer_id = $3, updated_at = now()
       where id = $1`,
      [row.id, state, assignee],
    );
    await this.audit.record(client, {
      actorId: user.id,
      action,
      objectType: 'case',
      objectId: row.id,
      priorState: row.state,
      newState: state,
      reason: options.reason,
    });
    return { id: row.id, state };
  }

  private requireAssigned(row: StaffCaseRow, user: SessionUser) {
    if (row.assigned_reviewer_id !== user.id) {
      throw new ForbiddenException(
        'Take this request before you work on it.',
      );
    }
  }

  // Listing happens after the decision, when the deciding reviewer may have
  // moved on, so an administrator may act too.
  private requireOwnerOrAdmin(row: StaffCaseRow, user: SessionUser) {
    if (row.assigned_reviewer_id !== user.id && user.role !== 'admin') {
      throw new ForbiddenException(
        'Only the reviewer on this request or an administrator can do that.',
      );
    }
  }

  private requireState(row: StaffCaseRow, states: string[]) {
    if (!states.includes(row.state)) {
      throw new ConflictException(
        'This request is not at a step where you can do that.',
      );
    }
  }

  private async find(
    client: Queryable,
    user: SessionUser,
    caseId: string,
    lock = false,
  ) {
    const found = await client.query<StaffCaseRow>(
      `${STAFF_CASE_SQL} where c.id = $1 and c.state <> 'draft'
       ${lock ? 'for update of c' : ''}`,
      [caseId],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException('We could not find that request.');
    if (row.requester_id === user.id) {
      throw new ForbiddenException(
        'This is your own request, so you cannot review it.',
      );
    }
    return row;
  }
}
