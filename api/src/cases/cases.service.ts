import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { CatalogService } from '../catalog/catalog.service';
import { DbService, Queryable } from '../db/db.service';
import {
  ACCEPTED_FILE_TYPES,
  sniffMimeType,
  VaultService,
} from '../storage/vault.service';
import { CreateCaseDto, EVIDENCE_KINDS } from './cases.dto';

const MAX_EVIDENCE_PER_CASE = 5;
const MIN_STORY_LENGTH = 20;

// Staff reads and internal checks stay out of the requester's history.
const REQUESTER_EVENTS = [
  'case.created',
  'evidence.added',
  'case.submitted',
  'case.claimed',
  'case.info_requested',
  'case.replied',
  'case.decided',
  'case.appealed',
  'appeal.decided',
  'case.published',
  'case.unpublished',
  'pledge.made',
  'pledge.withdrawn',
  'case.withdrawn',
];
const CAN_WITHDRAW = [
  'draft',
  'submitted',
  'in_review',
  'needs_more_information',
  'approved',
  'published',
];

const CASE_COLUMNS = `
  id, public_ref, kind, category,
  (select nc.label from need_categories nc where nc.key = cases.category)
    as category_label,
  state, what_happened,
  amount_requested_cents, to_char(due_date, 'YYYY-MM-DD') as due_date,
  provider_name, already_paid_cents, other_assistance_cents,
  other_assistance_note, consequence, recurrence, city, region,
  listing_preference, visibility, public_summary, submitted_at,
  created_at, updated_at`;

interface CaseRow {
  id: string;
  public_ref: string;
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
  listing_preference: string;
  visibility: string | null;
  public_summary: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toCase(row: CaseRow) {
  return {
    id: row.id,
    publicRef: row.public_ref,
    kind: row.kind,
    category: row.category,
    categoryLabel: row.category_label ?? row.category,
    state: row.state,
    whatHappened: row.what_happened,
    amountRequestedCents: row.amount_requested_cents,
    dueDate: row.due_date,
    providerName: row.provider_name,
    alreadyPaidCents: row.already_paid_cents,
    otherAssistanceCents: row.other_assistance_cents,
    otherAssistanceNote: row.other_assistance_note,
    consequence: row.consequence,
    recurrence: row.recurrence,
    city: row.city,
    region: row.region,
    listingPreference: row.listing_preference,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
  })}`;
}

@Injectable()
export class CasesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly vault: VaultService,
    private readonly catalog: CatalogService,
  ) {}

  async listFor(userId: string) {
    const found = await this.db.query<CaseRow>(
      `select ${CASE_COLUMNS} from cases
       where requester_id = $1 order by created_at desc`,
      [userId],
    );
    return found.rows.map(toCase);
  }

  async create(userId: string, dto: CreateCaseDto) {
    const category = await this.catalog.category(this.db, dto.category);
    if (!category || !category.enabled) {
      throw new BadRequestException('Choose the kind of help you need.');
    }
    const quick = dto.kind === 'quick';
    if (quick && category.quickMaxCents === null) {
      throw new BadRequestException(
        `${category.label} needs the full request form.`,
      );
    }
    const cap = quick ? category.quickMaxCents! : category.maxAmountCents;
    if (dto.amountRequestedCents > cap) {
      throw new BadRequestException(
        quick
          ? `A small request for ${category.label.toLowerCase()} can be up to ${dollars(cap)}. Use the full form for more.`
          : `A request for ${category.label.toLowerCase()} can be up to ${dollars(cap)}.`,
      );
    }
    if (!quick && dto.whatHappened.trim().length < MIN_STORY_LENGTH) {
      throw new BadRequestException(
        `Tell us what happened in at least ${MIN_STORY_LENGTH} characters.`,
      );
    }

    return this.db.tx(async (client) => {
      const inserted = await client.query<CaseRow>(
        `insert into cases
           (requester_id, kind, category, what_happened,
            amount_requested_cents, due_date, provider_name,
            already_paid_cents, other_assistance_cents,
            other_assistance_note, consequence, recurrence, city, region,
            listing_preference)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15)
         returning ${CASE_COLUMNS}`,
        [
          userId,
          dto.kind,
          dto.category,
          dto.whatHappened.trim(),
          dto.amountRequestedCents,
          dto.dueDate?.slice(0, 10) ?? null,
          dto.providerName?.trim() || null,
          dto.alreadyPaidCents ?? 0,
          dto.otherAssistanceCents ?? 0,
          dto.otherAssistanceNote?.trim() || null,
          dto.consequence?.trim() || null,
          dto.recurrence ?? null,
          dto.city.trim(),
          dto.region.trim(),
          dto.listingPreference ?? 'angels_only',
        ],
      );
      const row = inserted.rows[0];
      await this.audit.record(client, {
        actorId: userId,
        action: 'case.created',
        objectType: 'case',
        objectId: row.id,
        newState: row.state,
        reason: dto.kind,
      });
      return toCase(row);
    });
  }

  async get(userId: string, caseId: string) {
    const row = await this.findOwned(this.db, userId, caseId);
    const [evidence, timeline, messages, decisions, category] =
      await Promise.all([
        this.db.query<{
          id: string;
          kind: string;
          original_name: string;
          size_bytes: number;
          uploaded_at: Date;
        }>(
          `select id, kind, original_name, size_bytes, uploaded_at
           from need_evidence where case_id = $1 order by uploaded_at`,
          [caseId],
        ),
        this.db.query<{
          action: string;
          new_state: string | null;
          created_at: Date;
        }>(
          `select action, new_state, created_at from audit_events
           where object_type = 'case' and object_id = $1
             and action = any($2) order by id`,
          [caseId, REQUESTER_EVENTS],
        ),
        this.db.query<{
          id: string;
          kind: string;
          body: string;
          author_id: string;
          created_at: Date;
        }>(
          `select id, kind, body, author_id, created_at from case_messages
           where case_id = $1 order by created_at`,
          [caseId],
        ),
        this.db.query<{
          kind: string;
          outcome: string;
          approved_amount_cents: number | null;
          expires_on: string | null;
          reason_code: string | null;
          rationale: string;
          restrictions: string | null;
          decided_at: Date;
        }>(
          `select kind, outcome, approved_amount_cents,
                  to_char(expires_on, 'YYYY-MM-DD') as expires_on,
                  reason_code, rationale, restrictions, decided_at
           from decisions where case_id = $1 order by decided_at`,
          [caseId],
        ),
        this.catalog.category(this.db, row.category),
      ]);
    const latest = decisions.rows.at(-1);
    const pledged = await this.db.query<{ cents: number; angels: number }>(
      `select coalesce(sum(amount_cents), 0)::int as cents,
              count(distinct angel_id)::int as angels
       from pledges where case_id = $1 and status = 'active'`,
      [caseId],
    );

    return {
      ...toCase(row),
      documentRequired:
        row.kind === 'standard' && (category?.requiresDocument ?? true),
      evidence: evidence.rows.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.original_name,
        sizeBytes: e.size_bytes,
        uploadedAt: e.uploaded_at,
      })),
      timeline: timeline.rows.map((t) => ({
        action: t.action,
        state: t.new_state,
        at: t.created_at,
      })),
      // The requester never learns which reviewer wrote or decided.
      messages: messages.rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        body: m.body,
        fromYou: m.author_id === userId,
        at: m.created_at,
      })),
      decision: latest
        ? {
            kind: latest.kind,
            outcome: latest.outcome,
            approvedAmountCents: latest.approved_amount_cents,
            expiresOn: latest.expires_on,
            reasonCode: latest.reason_code,
            rationale: latest.rationale,
            restrictions: latest.restrictions,
            at: latest.decided_at,
          }
        : null,
      canAppeal: row.state === 'declined' && latest?.kind === 'initial',
      // What Angels see. The requester can check that it does not point to them.
      listing:
        row.state === 'published'
          ? { visibility: row.visibility, summary: row.public_summary }
          : null,
      pledgedCents: pledged.rows[0].cents,
      angels: pledged.rows[0].angels,
    };
  }

  async addEvidence(
    userId: string,
    caseId: string,
    kind: string,
    file: { originalname: string; buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException('Choose what kind of document this is.');
    }
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException(`Upload a ${ACCEPTED_FILE_TYPES} file.`);
    }

    const row = await this.findOwned(this.db, userId, caseId);
    if (row.state !== 'draft' && row.state !== 'needs_more_information') {
      throw new ConflictException(
        'You can add documents before you submit, or when we ask for more.',
      );
    }

    const count = await this.db.query<{ n: number }>(
      'select count(*)::int as n from need_evidence where case_id = $1',
      [caseId],
    );
    if (count.rows[0].n >= MAX_EVIDENCE_PER_CASE) {
      throw new BadRequestException(
        `A request can hold up to ${MAX_EVIDENCE_PER_CASE} documents.`,
      );
    }

    const stored = await this.vault.put(`evidence/${caseId}`, file.buffer);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    return this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into need_evidence
           (case_id, kind, original_name, mime_type, size_bytes, storage,
            storage_key, encryption, sha256, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          caseId,
          kind,
          file.originalname.slice(0, 200),
          mimeType,
          file.size,
          stored.storage,
          stored.key,
          stored.encryption,
          sha256,
          userId,
        ],
      );
      await this.audit.record(client, {
        actorId: userId,
        action: 'evidence.added',
        objectType: 'case',
        objectId: caseId,
        newState: row.state,
      });
      return { id: inserted.rows[0].id };
    });
  }

  async submit(user: SessionUser, caseId: string) {
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message:
          'Confirm your email before you submit. We sent you a link when you signed up.',
        code: 'email_not_verified',
      });
    }
    return this.db.tx(async (client) => {
      const row = await this.findOwned(client, user.id, caseId, true);
      if (row.state !== 'draft') {
        throw new ConflictException(
          'You can only submit a request that has not been submitted.',
        );
      }

      const category = await this.catalog.category(client, row.category);
      if (row.kind === 'standard' && (category?.requiresDocument ?? true)) {
        const evidence = await client.query(
          'select 1 from need_evidence where case_id = $1 limit 1',
          [caseId],
        );
        if (evidence.rowCount === 0) {
          throw new BadRequestException(
            'Add the bill or notice before you submit.',
          );
        }
      }

      // Record exactly which wording the person agreed to.
      const texts = await this.catalog.currentTexts(client);
      const updated = await client.query<CaseRow>(
        `update cases
         set state = 'submitted', consent_at = now(), attested_at = now(),
             consent_text_id = $2, attestation_text_id = $3,
             submitted_at = now(), updated_at = now()
         where id = $1 returning ${CASE_COLUMNS}`,
        [caseId, texts.consent.id, texts.attestation.id],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'case.submitted',
        objectType: 'case',
        objectId: caseId,
        priorState: row.state,
        newState: 'submitted',
        reason: `consent v${texts.consent.version}, attestation v${texts.attestation.version}`,
      });
      return toCase(updated.rows[0]);
    });
  }

  reply(userId: string, caseId: string, message: string) {
    return this.db.tx(async (client) => {
      const row = await this.findOwned(client, userId, caseId, true);
      if (row.state !== 'needs_more_information') {
        throw new ConflictException(
          'We are not waiting on anything from you for this request.',
        );
      }
      await client.query(
        `insert into case_messages (case_id, author_id, kind, body)
         values ($1, $2, 'reply', $3)`,
        [caseId, userId, message.trim()],
      );
      return this.setState(client, userId, row, 'in_review', 'case.replied');
    });
  }

  appeal(userId: string, caseId: string, message: string) {
    return this.db.tx(async (client) => {
      const row = await this.findOwned(client, userId, caseId, true);
      const appealed = await client.query(
        `select 1 from decisions where case_id = $1 and kind = 'appeal'`,
        [caseId],
      );
      if (row.state !== 'declined' || appealed.rowCount !== 0) {
        throw new ConflictException('This request cannot be appealed.');
      }
      await client.query(
        `insert into case_messages (case_id, author_id, kind, body)
         values ($1, $2, 'appeal', $3)`,
        [caseId, userId, message.trim()],
      );
      // Unassign so a different reviewer picks up the appeal.
      await client.query(
        'update cases set assigned_reviewer_id = null where id = $1',
        [caseId],
      );
      return this.setState(client, userId, row, 'appealed', 'case.appealed');
    });
  }

  async withdraw(userId: string, caseId: string) {
    return this.db.tx(async (client) => {
      const row = await this.findOwned(client, userId, caseId, true);
      if (!CAN_WITHDRAW.includes(row.state)) {
        throw new ConflictException(
          'This request can no longer be withdrawn here. Contact us for help.',
        );
      }
      await client.query(
        `update pledges
         set status = 'released', ended_at = now(),
             ended_reason = 'The requester withdrew the need'
         where case_id = $1 and status = 'active'`,
        [caseId],
      );
      return this.setState(
        client,
        userId,
        row,
        'withdrawn',
        'case.withdrawn',
        'Withdrawn by requester',
      );
    });
  }

  private async setState(
    client: Queryable,
    userId: string,
    row: CaseRow,
    state: string,
    action: string,
    reason?: string,
  ) {
    await client.query(
      'update cases set state = $2, updated_at = now() where id = $1',
      [row.id, state],
    );
    await this.audit.record(client, {
      actorId: userId,
      action,
      objectType: 'case',
      objectId: row.id,
      priorState: row.state,
      newState: state,
      reason,
    });
    return { id: row.id, state };
  }

  // Someone else's case reads as missing, so case ids cannot be probed.
  private async findOwned(
    client: Queryable,
    userId: string,
    caseId: string,
    lock = false,
  ) {
    const found = await client.query<CaseRow>(
      `select ${CASE_COLUMNS} from cases
       where id = $1 and requester_id = $2 ${lock ? 'for update' : ''}`,
      [caseId, userId],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException('We could not find that request.');
    return row;
  }
}
