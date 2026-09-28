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
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  ACCEPTED_FILE_TYPES,
  sniffMimeType,
  VaultService,
} from '../storage/vault.service';

export const ID_TYPES = [
  'drivers_license',
  'state_id',
  'passport',
  'other',
] as const;

interface DocRow {
  id: string;
  user_id: string;
  doc_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage: string;
  storage_key: string;
  encryption: string | null;
  status: string;
  review_note: string | null;
  uploaded_at: Date;
  reviewed_at: Date | null;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly vault: VaultService,
    private readonly mail: MailService,
  ) {}

  async mine(user: SessionUser) {
    const [profile, docs] = await Promise.all([
      this.db.query<{ identity_status: string; identity_note: string | null }>(
        'select identity_status, identity_note from users where id = $1',
        [user.id],
      ),
      this.db.query<DocRow>(
        `select * from identity_documents where user_id = $1
         order by uploaded_at desc`,
        [user.id],
      ),
    ]);
    return {
      status: profile.rows[0].identity_status,
      note: profile.rows[0].identity_note,
      documents: docs.rows.map((d) => ({
        id: d.id,
        docType: d.doc_type,
        name: d.original_name,
        status: d.status,
        uploadedAt: d.uploaded_at,
      })),
    };
  }

  async upload(
    user: SessionUser,
    docType: string,
    file: { originalname: string; buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    if (!(ID_TYPES as readonly string[]).includes(docType)) {
      throw new BadRequestException('Choose what kind of ID this is.');
    }
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException(`Upload a ${ACCEPTED_FILE_TYPES} file.`);
    }
    if (user.identityStatus === 'verified') {
      throw new ConflictException('Your identity is already confirmed.');
    }
    const pending = await this.db.query<{ n: number }>(
      `select count(*)::int as n from identity_documents
       where user_id = $1 and status = 'pending'`,
      [user.id],
    );
    if (pending.rows[0].n >= 3) {
      throw new ConflictException(
        'We are still checking the ID you sent. We will email you when it is done.',
      );
    }

    const stored = await this.vault.put(`identity/${user.id}`, file.buffer);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    await this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into identity_documents
           (user_id, doc_type, original_name, mime_type, size_bytes, storage,
            storage_key, encryption, sha256)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [
          user.id,
          docType,
          file.originalname.slice(0, 200),
          mimeType,
          file.size,
          stored.storage,
          stored.key,
          stored.encryption,
          sha256,
        ],
      );
      await client.query(
        `update users set identity_status = 'pending', identity_note = null
         where id = $1`,
        [user.id],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'identity.uploaded',
        objectType: 'user',
        objectId: user.id,
        priorState: user.identityStatus,
        newState: 'pending',
        reason: inserted.rows[0].id,
      });
    });
  }

  async queue(reviewer: SessionUser) {
    const found = await this.db.query<
      DocRow & { full_name: string; email: string; open_cases: number }
    >(
      `select d.*, u.full_name, u.email,
              (select count(*)::int from cases c
               where c.requester_id = u.id
                 and c.state in ('submitted', 'in_review',
                                 'needs_more_information', 'appealed')
              ) as open_cases
       from identity_documents d join users u on u.id = d.user_id
       where d.status = 'pending' and d.user_id <> $1
       order by d.uploaded_at`,
      [reviewer.id],
    );
    return found.rows.map((d) => ({
      id: d.id,
      docType: d.doc_type,
      name: d.original_name,
      sizeBytes: d.size_bytes,
      uploadedAt: d.uploaded_at,
      person: { name: d.full_name, email: d.email },
      openRequests: d.open_cases,
    }));
  }

  async open(reviewer: SessionUser, docId: string) {
    const doc = await this.find(reviewer, docId);
    const bytes = await this.vault.get({
      storage: doc.storage,
      key: doc.storage_key,
      encryption: doc.encryption,
    });
    await this.audit.record(this.db, {
      actorId: reviewer.id,
      action: 'identity.viewed',
      objectType: 'user',
      objectId: doc.user_id,
      reason: doc.id,
    });
    return { name: doc.original_name, mimeType: doc.mime_type, bytes };
  }

  async decide(
    reviewer: SessionUser,
    docId: string,
    outcome: 'verified' | 'rejected',
    note: string | undefined,
  ) {
    if (outcome === 'rejected' && !note?.trim()) {
      throw new BadRequestException(
        'Say what the person should send instead.',
      );
    }
    const person = await this.db.tx(async (client) => {
      const doc = await this.find(reviewer, docId);
      const updated = await client.query(
        `update identity_documents
         set status = $2, review_note = $3, reviewed_by = $4,
             reviewed_at = now()
         where id = $1 and status = 'pending'`,
        [docId, outcome, note?.trim() || null, reviewer.id],
      );
      if (updated.rowCount === 0) {
        throw new ConflictException('This ID has already been checked.');
      }
      if (outcome === 'verified') {
        // One accepted ID settles it. Other pending uploads are no longer needed.
        await client.query(
          `update identity_documents
           set status = 'superseded', reviewed_by = $2, reviewed_at = now()
           where user_id = $1 and status = 'pending'`,
          [doc.user_id, reviewer.id],
        );
      }
      const found = await client.query<{
        email: string;
        full_name: string;
        identity_status: string;
      }>(
        `select email, full_name, identity_status from users
         where id = $1 for update`,
        [doc.user_id],
      );
      await client.query(
        `update users set identity_status = $2, identity_note = $3
         where id = $1`,
        [doc.user_id, outcome, outcome === 'rejected' ? note!.trim() : null],
      );
      await this.audit.record(client, {
        actorId: reviewer.id,
        action: 'identity.decided',
        objectType: 'user',
        objectId: doc.user_id,
        priorState: found.rows[0].identity_status,
        newState: outcome,
        reason: docId,
      });
      return found.rows[0];
    });

    await this.mail.send({
      to: person.email,
      subject:
        outcome === 'verified'
          ? 'Your identity is confirmed'
          : 'We need a different ID from you',
      paragraphs:
        outcome === 'verified'
          ? [
              `Hello ${person.full_name},`,
              'We have confirmed your identity. You do not need to send anything else.',
            ]
          : [
              `Hello ${person.full_name},`,
              'We could not confirm your identity from the ID you sent.',
              note!.trim(),
              'Sign in and upload a new one from your account page.',
            ],
    });
  }

  private async find(reviewer: SessionUser, docId: string) {
    const found = await this.db.query<DocRow>(
      'select * from identity_documents where id = $1',
      [docId],
    );
    const doc = found.rows[0];
    if (!doc) throw new NotFoundException('We could not find that ID.');
    if (doc.user_id === reviewer.id) {
      throw new ForbiddenException('You cannot check your own ID.');
    }
    return doc;
  }
}
