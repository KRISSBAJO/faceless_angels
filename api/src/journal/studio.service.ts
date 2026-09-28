import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { displayName } from '../prayer/prayer.shared';
import { sniffImageType, VaultService } from '../storage/vault.service';
import {
  ArticleDto,
  AuthorDto,
  CategoryDto,
  ReviewDto,
  SeriesDto,
} from './journal.dto';
import {
  plainText,
  readingMinutes,
  slugify,
  unsubscribeToken,
} from './journal.shared';
import { LIVE } from './reader.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NOTIFY_CHECK_MS = 5 * 60 * 1000;
const MIN_BODY_WORDS = 40;

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  kind: string;
  category_key: string;
  category_label: string;
  tags: string[];
  cover_media_id: string | null;
  cover_alt: string | null;
  scripture: { ref: string; text?: string }[];
  reflection: string[];
  action: string;
  series_id: string | null;
  series_position: number | null;
  author_id: string;
  author_name: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: string;
  review_note: string | null;
  published_at: Date | null;
  featured: boolean;
  allow_comments: boolean;
  reading_minutes: number;
  created_at: Date;
  updated_at: Date;
  live: boolean;
}

const ARTICLE_SQL = `
  select a.*, c.label as category_label,
         coalesce(ja.display_name, u.full_name) as author_name,
         coalesce(jr.display_name, r.full_name) as reviewer_name,
         (${LIVE}) as live
  from journal_articles a
  join journal_categories c on c.key = a.category_key
  join users u on u.id = a.author_id
  left join journal_authors ja on ja.user_id = a.author_id
  left join users r on r.id = a.reviewer_id
  left join journal_authors jr on jr.user_id = a.reviewer_id`;

/** How the article stands, in words a writer would use. */
function stage(row: ArticleRow) {
  if (row.status !== 'published') return row.status;
  return row.live ? 'published' : 'scheduled';
}

function view(row: ArticleRow, viewer: SessionUser) {
  const mine = row.author_id === viewer.id;
  const editor = viewer.role === 'editor' || viewer.role === 'admin';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    kind: row.kind,
    category: { key: row.category_key, label: row.category_label },
    tags: row.tags,
    cover: row.cover_media_id
      ? { id: row.cover_media_id, alt: row.cover_alt ?? '' }
      : null,
    scripture: row.scripture,
    reflection: row.reflection,
    action: row.action,
    seriesId: row.series_id,
    seriesPosition: row.series_position,
    author: { id: row.author_id, name: row.author_name },
    reviewer: row.reviewer_id
      ? { id: row.reviewer_id, name: row.reviewer_name }
      : null,
    stage: stage(row),
    reviewNote: row.review_note,
    publishedAt: row.published_at,
    featured: row.featured,
    allowComments: row.allow_comments,
    readingMinutes: row.reading_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mine,
    can: {
      edit: mine || editor,
      // Nobody reviews their own writing.
      review: !mine && row.status === 'in_review',
      // An administrator may publish their own work without a second reader.
      publish:
        row.status === 'approved' ||
        (viewer.role === 'admin' &&
          ['draft', 'in_review', 'changes_requested'].includes(row.status)),
      manage: editor,
    },
  };
}

@Injectable()
export class JournalStudioService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(JournalStudioService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly vault: VaultService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    const run = () =>
      this.notifyFollowers().catch((err) =>
        this.log.error(`Journal emails failed: ${String(err)}`),
      );
    setTimeout(run, 25_000).unref();
    this.timer = setInterval(run, NOTIFY_CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- The desk

  async desk(viewer: SessionUser) {
    const [stages, waiting, top, comments] = await Promise.all([
      this.db.query<{ stage: string; n: number }>(
        `select case when a.status = 'published' and a.published_at > now()
                     then 'scheduled' else a.status end as stage,
                count(*)::int as n
         from journal_articles a group by 1`,
      ),
      this.db.query<{ n: number }>(
        `select count(*)::int as n from journal_articles
         where status = 'in_review' and author_id <> $1`,
        [viewer.id],
      ),
      this.db.query<{ slug: string; title: string; views: number }>(
        `select a.slug, a.title, sum(v.views)::int as views
         from journal_views v join journal_articles a on a.id = v.article_id
         where v.day > current_date - 30
         group by a.id order by views desc limit 5`,
      ),
      this.db.query<{ n: number }>(
        `select count(*)::int as n from journal_comments m
         where m.status = 'pending'
            or exists (select 1 from journal_comment_reports p
                       where p.comment_id = m.id and p.resolved_at is null)`,
      ),
    ]);
    return {
      stages: Object.fromEntries(stages.rows.map((s) => [s.stage, s.n])),
      waitingForYou: waiting.rows[0].n,
      commentsToCheck: comments.rows[0].n,
      mostRead: top.rows,
    };
  }

  async list(
    viewer: SessionUser,
    filters: { stage?: string; mine?: string; q?: string },
  ) {
    const found = await this.db.query<ArticleRow>(
      `${ARTICLE_SQL}
       where ($1::text is null
              or case when a.status = 'published' and a.published_at > now()
                      then 'scheduled' else a.status end = $1)
         and ($2::uuid is null or a.author_id = $2)
         and ($3::text is null or a.title ilike '%' || $3 || '%')
       order by a.updated_at desc limit 200`,
      [
        filters.stage || null,
        filters.mine === 'yes' ? viewer.id : null,
        filters.q?.trim() || null,
      ],
    );
    return found.rows.map((row) => {
      const { body: _body, ...rest } = view(row, viewer);
      return rest;
    });
  }

  async get(viewer: SessionUser, id: string) {
    const row = await this.find(this.db, id);
    const [revisions, corrections] = await Promise.all([
      this.db.query<{
        id: string;
        title: string;
        note: string | null;
        editor: string;
        created_at: Date;
        words: number;
      }>(
        `select v.id, v.title, v.note, u.full_name as editor, v.created_at,
                array_length(regexp_split_to_array(trim(v.body), '\\s+'), 1)
                  as words
         from journal_revisions v join users u on u.id = v.edited_by
         where v.article_id = $1 order by v.created_at desc limit 50`,
        [id],
      ),
      this.db.query<{ id: string; body: string; created_at: Date }>(
        `select id, body, created_at from journal_corrections
         where article_id = $1 order by created_at`,
        [id],
      ),
    ]);
    return {
      ...view(row, viewer),
      revisions: revisions.rows.map((v) => ({
        id: v.id,
        title: v.title,
        note: v.note,
        by: displayName(v.editor),
        words: v.words ?? 0,
        at: v.created_at,
      })),
      corrections: corrections.rows.map((c) => ({
        id: c.id,
        body: c.body,
        at: c.created_at,
      })),
    };
  }

  async create(viewer: SessionUser, dto: ArticleDto) {
    await this.checkLinks(dto);
    const id = await this.db.tx(async (client) => {
      const slug = await this.freeSlug(client, slugify(dto.title));
      const inserted = await client.query<{ id: string }>(
        `insert into journal_articles
           (slug, title, summary, body, kind, category_key, tags,
            cover_media_id, cover_alt, scripture, reflection, action,
            series_id, series_position, author_id, allow_comments,
            reading_minutes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17)
         returning id`,
        [slug, ...this.fields(dto), viewer.id, dto.allowComments ?? true,
          readingMinutes(dto.body ?? '')],
      );
      await this.snapshot(client, inserted.rows[0].id, viewer, 'First draft');
      await this.audit.record(client, {
        actorId: viewer.id,
        action: 'journal.created',
        objectType: 'article',
        objectId: inserted.rows[0].id,
        newState: 'draft',
        reason: dto.title.trim(),
      });
      return inserted.rows[0].id;
    });
    return this.get(viewer, id);
  }

  async update(viewer: SessionUser, id: string, dto: ArticleDto) {
    await this.checkLinks(dto);
    await this.db.tx(async (client) => {
      const row = await this.find(client, id, true);
      this.requireEdit(row, viewer);
      if (row.status === 'archived') {
        throw new ConflictException('Bring the article back before you change it.');
      }
      const next = this.fields(dto);
      const wordsChanged =
        dto.title.trim() !== row.title ||
        (dto.summary ?? '').trim() !== row.summary ||
        (dto.body ?? '') !== row.body ||
        JSON.stringify(dto.scripture ?? []) !== JSON.stringify(row.scripture);
      // New words after approval need a second reader again.
      const status =
        wordsChanged && row.status === 'approved' ? 'draft' : row.status;
      // The address of a published article never changes, so links keep working.
      const slug =
        row.published_at || dto.title.trim() === row.title
          ? row.slug
          : await this.freeSlug(client, slugify(dto.title), id);

      await client.query(
        `update journal_articles
         set slug = $2, title = $3, summary = $4, body = $5, kind = $6,
             category_key = $7, tags = $8, cover_media_id = $9,
             cover_alt = $10, scripture = $11, reflection = $12,
             action = $13, series_id = $14, series_position = $15,
             allow_comments = $16, reading_minutes = $17, status = $18,
             updated_at = now()
         where id = $1`,
        [
          id,
          slug,
          ...next,
          dto.allowComments ?? row.allow_comments,
          readingMinutes(dto.body ?? ''),
          status,
        ],
      );
      if (wordsChanged) {
        await this.snapshot(client, id, viewer, dto.note?.trim() || null);
        await this.audit.record(client, {
          actorId: viewer.id,
          action: 'journal.edited',
          objectType: 'article',
          objectId: id,
          priorState: row.status,
          newState: status,
          reason: dto.note?.trim(),
        });
      }
    });
    return this.get(viewer, id);
  }

  async submit(viewer: SessionUser, id: string) {
    return this.move(viewer, id, (row) => {
      if (row.author_id !== viewer.id) {
        throw new ForbiddenException('Only the author can send it for review.');
      }
      if (!['draft', 'changes_requested'].includes(row.status)) {
        throw new ConflictException('This article is not a draft.');
      }
      this.requireReady(row);
      return { status: 'in_review', action: 'journal.submitted' };
    });
  }

  async review(viewer: SessionUser, id: string, dto: ReviewDto) {
    if (dto.action === 'changes' && !dto.note?.trim()) {
      throw new BadRequestException('Say what should change.');
    }
    const result = await this.move(viewer, id, (row) => {
      if (row.author_id === viewer.id) {
        throw new ForbiddenException(
          'You wrote this. Someone else must review it.',
        );
      }
      if (row.status !== 'in_review') {
        throw new ConflictException('This article is not waiting for review.');
      }
      return {
        status: dto.action === 'approve' ? 'approved' : 'changes_requested',
        action:
          dto.action === 'approve'
            ? 'journal.approved'
            : 'journal.changes_requested',
        reviewer: viewer.id,
        note: dto.note?.trim() || null,
      };
    });
    const author = await this.db.query<{ email: string; full_name: string; title: string }>(
      `select u.email, u.full_name, a.title from journal_articles a
       join users u on u.id = a.author_id where a.id = $1`,
      [id],
    );
    await this.mail.send({
      to: author.rows[0].email,
      subject:
        dto.action === 'approve'
          ? `Approved: ${author.rows[0].title}`
          : `Changes asked for: ${author.rows[0].title}`,
      paragraphs: [
        `Hello ${author.rows[0].full_name},`,
        dto.action === 'approve'
          ? 'Your article was approved. It can now be published.'
          : 'A reviewer asked for changes to your article.',
        ...(dto.note?.trim() ? [dto.note.trim()] : []),
      ],
      action: {
        label: 'Open the article',
        url: `${config.webUrl}/journal/studio/${id}`,
      },
    });
    return result;
  }

  async publish(viewer: SessionUser, id: string, publishAt: string | undefined) {
    const when = publishAt ? new Date(publishAt) : new Date();
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('Enter the date and time to publish.');
    }
    return this.move(viewer, id, (row) => {
      const reviewed = row.status === 'approved';
      const ownWork =
        viewer.role === 'admin' &&
        ['draft', 'in_review', 'changes_requested'].includes(row.status);
      if (!reviewed && !ownWork) {
        throw new ConflictException(
          'An article is published after a second person approves it.',
        );
      }
      this.requireReady(row);
      return {
        status: 'published',
        publishedAt: when,
        action: reviewed ? 'journal.published' : 'journal.published_unreviewed',
        reason: when.getTime() > Date.now() ? 'scheduled' : undefined,
      };
    });
  }

  async unpublish(viewer: SessionUser, id: string) {
    this.requireEditor(viewer);
    return this.move(viewer, id, (row) => {
      if (row.status !== 'published') {
        throw new ConflictException('This article is not published.');
      }
      return {
        status: row.reviewer_id ? 'approved' : 'draft',
        publishedAt: null,
        action: 'journal.unpublished',
      };
    });
  }

  async archive(viewer: SessionUser, id: string, on: boolean) {
    this.requireEditor(viewer);
    return this.move(viewer, id, (row) => {
      if (on === (row.status === 'archived')) {
        throw new ConflictException(
          on ? 'This article is already archived.' : 'This article is not archived.',
        );
      }
      return {
        status: on ? 'archived' : 'draft',
        publishedAt: null,
        action: on ? 'journal.archived' : 'journal.restored',
      };
    });
  }

  async feature(viewer: SessionUser, id: string, featured: boolean) {
    this.requireEditor(viewer);
    await this.find(this.db, id);
    await this.db.query(
      'update journal_articles set featured = $2 where id = $1',
      [id, featured],
    );
    await this.audit.record(this.db, {
      actorId: viewer.id,
      action: featured ? 'journal.featured' : 'journal.unfeatured',
      objectType: 'article',
      objectId: id,
    });
  }

  async correct(viewer: SessionUser, id: string, body: string) {
    const row = await this.find(this.db, id);
    this.requireEdit(row, viewer);
    if (row.status !== 'published') {
      throw new ConflictException(
        'Corrections are for published articles. Change a draft directly.',
      );
    }
    await this.db.query(
      `insert into journal_corrections (article_id, body, created_by)
       values ($1, $2, $3)`,
      [id, body.trim(), viewer.id],
    );
    await this.audit.record(this.db, {
      actorId: viewer.id,
      action: 'journal.corrected',
      objectType: 'article',
      objectId: id,
      reason: body.trim().slice(0, 200),
    });
  }

  async revision(viewer: SessionUser, id: string, revisionId: string) {
    await this.find(this.db, id);
    const found = await this.db.query<{
      title: string;
      summary: string;
      body: string;
      scripture: { ref: string; text?: string }[];
      created_at: Date;
    }>(
      `select title, summary, body, scripture, created_at
       from journal_revisions where id = $1 and article_id = $2`,
      [revisionId, id],
    );
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that version.');
    }
    return { ...found.rows[0], at: found.rows[0].created_at };
  }

  async restore(viewer: SessionUser, id: string, revisionId: string) {
    const old = await this.revision(viewer, id, revisionId);
    await this.db.tx(async (client) => {
      const row = await this.find(client, id, true);
      this.requireEdit(row, viewer);
      await client.query(
        `update journal_articles
         set title = $2, summary = $3, body = $4, scripture = $5,
             reading_minutes = $6, updated_at = now(),
             status = case when status = 'approved' then 'draft' else status end
         where id = $1`,
        [
          id,
          old.title,
          old.summary,
          old.body,
          JSON.stringify(old.scripture),
          readingMinutes(old.body),
        ],
      );
      await this.snapshot(client, id, viewer, 'Brought back an earlier version');
      await this.audit.record(client, {
        actorId: viewer.id,
        action: 'journal.restored_version',
        objectType: 'article',
        objectId: id,
        reason: revisionId,
      });
    });
    return this.get(viewer, id);
  }

  async stats(id: string) {
    await this.find(this.db, id);
    const [days, readers, reactions, other] = await Promise.all([
      this.db.query<{ day: string; views: number }>(
        `select to_char(d::date, 'YYYY-MM-DD') as day,
                coalesce(v.views, 0)::int as views
         from generate_series(current_date - 29, current_date, '1 day') d
         left join journal_views v
           on v.article_id = $1 and v.day = d::date
         order by d`,
        [id],
      ),
      this.db.query<{ started: number; finished: number }>(
        `select count(*)::int as started,
                count(finished_at)::int as finished
         from journal_reads where article_id = $1`,
        [id],
      ),
      this.db.query<{ kind: string; n: number }>(
        `select kind, count(*)::int as n from journal_reactions
         where article_id = $1 group by kind`,
        [id],
      ),
      this.db.query<{
        views: number;
        comments: number;
        saved: number;
        notes: number;
        shares: number;
      }>(
        `select
           (select coalesce(sum(views), 0)::int from journal_views
            where article_id = $1) as views,
           (select count(*)::int from journal_comments
            where article_id = $1 and status = 'active') as comments,
           (select count(*)::int from journal_bookmarks
            where article_id = $1) as saved,
           (select count(*)::int from journal_notes
            where article_id = $1) as notes,
           (select coalesce(sum(shares), 0)::int from journal_shares
            where article_id = $1) as shares`,
        [id],
      ),
    ]);
    const channels = await this.db.query<{ channel: string; n: number }>(
      `select channel, sum(shares)::int as n from journal_shares
       where article_id = $1 group by channel order by n desc`,
      [id],
    );
    return {
      views: other.rows[0].views,
      shares: other.rows[0].shares,
      sharedTo: Object.fromEntries(channels.rows.map((c) => [c.channel, c.n])),
      last30Days: days.rows,
      readersStarted: readers.rows[0].started,
      readersFinished: readers.rows[0].finished,
      reactions: Object.fromEntries(reactions.rows.map((r) => [r.kind, r.n])),
      comments: other.rows[0].comments,
      saved: other.rows[0].saved,
      // A count only. What readers write in their notes is never read.
      notes: other.rows[0].notes,
    };
  }

  // ---- Cover images

  async upload(
    viewer: SessionUser,
    file: { buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) throw new BadRequestException('Choose a picture to upload.');
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException('Upload a JPG, PNG, or WebP picture.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Upload a picture of 5 MB or less.');
    }
    const stored = await this.vault.put('journal', file.buffer, {
      published: true,
    });
    const inserted = await this.db.query<{ id: string }>(
      `insert into journal_media
         (storage, storage_key, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [stored.storage, stored.key, mimeType, file.size, viewer.id],
    );
    return { id: inserted.rows[0].id };
  }

  async media(id: string) {
    const found = await this.db.query<{
      storage: string;
      storage_key: string;
      mime_type: string;
    }>(
      'select storage, storage_key, mime_type from journal_media where id = $1',
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException('We could not find that picture.');
    return {
      mimeType: row.mime_type,
      bytes: await this.vault.get({
        storage: row.storage,
        key: row.storage_key,
        encryption: null,
      }),
    };
  }

  // ---- Series, categories, bylines

  async seriesAll() {
    const found = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      articles: number;
    }>(
      `select s.id, s.slug, s.title, s.description,
              (select count(*)::int from journal_articles a
               where a.series_id = s.id) as articles
       from journal_series s order by s.created_at desc`,
    );
    return found.rows;
  }

  async saveSeries(viewer: SessionUser, id: string | null, dto: SeriesDto) {
    if (id) {
      const updated = await this.db.query(
        `update journal_series set title = $2, description = $3
         where id = $1`,
        [id, dto.title.trim(), dto.description.trim()],
      );
      if (updated.rowCount === 0) {
        throw new NotFoundException('We could not find that series.');
      }
      return { id };
    }
    return this.db.tx(async (client) => {
      const base = slugify(dto.title);
      const taken = await client.query<{ slug: string }>(
        `select slug from journal_series where slug = $1 or slug like $1 || '-%'`,
        [base],
      );
      const used = new Set(taken.rows.map((r) => r.slug));
      let slug = base;
      for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
      const inserted = await client.query<{ id: string }>(
        `insert into journal_series (slug, title, description, created_by)
         values ($1, $2, $3, $4) returning id`,
        [slug, dto.title.trim(), dto.description.trim(), viewer.id],
      );
      return { id: inserted.rows[0].id };
    });
  }

  async categoriesAll() {
    const found = await this.db.query<{
      key: string;
      label: string;
      description: string;
      sort: number;
      enabled: boolean;
      articles: number;
    }>(
      `select c.*, (select count(*)::int from journal_articles a
                    where a.category_key = c.key) as articles
       from journal_categories c order by c.sort, c.label`,
    );
    return found.rows;
  }

  async saveCategory(viewer: SessionUser, key: string | null, dto: CategoryDto) {
    this.requireEditor(viewer);
    if (key) {
      const updated = await this.db.query(
        `update journal_categories
         set label = $2, description = $3,
             enabled = coalesce($4, enabled), sort = coalesce($5, sort)
         where key = $1`,
        [key, dto.label.trim(), dto.description.trim(), dto.enabled ?? null, dto.sort ?? null],
      );
      if (updated.rowCount === 0) {
        throw new NotFoundException('We could not find that category.');
      }
    } else {
      const newKey = slugify(dto.label).replace(/-/g, '_').slice(0, 40);
      const inserted = await this.db.query(
        `insert into journal_categories (key, label, description, sort)
         select $1, $2, $3, coalesce($4, (select max(sort) + 10
                                          from journal_categories), 10)
         on conflict (key) do nothing`,
        [newKey, dto.label.trim(), dto.description.trim(), dto.sort ?? null],
      );
      if (inserted.rowCount === 0) {
        throw new ConflictException('A category with that name already exists.');
      }
      key = newKey;
    }
    await this.audit.record(this.db, {
      actorId: viewer.id,
      action: 'journal.category_saved',
      objectType: 'journal_category',
      objectKey: key,
      newState: dto.label.trim(),
    });
    return { key };
  }

  async byline(viewer: SessionUser) {
    const found = await this.db.query<{
      display_name: string;
      title: string | null;
      bio: string | null;
      photo_media_id: string | null;
    }>(
      `select display_name, title, bio, photo_media_id
       from journal_authors where user_id = $1`,
      [viewer.id],
    );
    const row = found.rows[0];
    return {
      displayName: row?.display_name ?? displayName(viewer.fullName),
      title: row?.title ?? '',
      bio: row?.bio ?? '',
      photoMediaId: row?.photo_media_id ?? null,
      set: !!row,
    };
  }

  async saveByline(viewer: SessionUser, dto: AuthorDto) {
    if (dto.photoMediaId) {
      const media = await this.db.query(
        'select 1 from journal_media where id = $1 and uploaded_by = $2',
        [dto.photoMediaId, viewer.id],
      );
      if (media.rowCount === 0) {
        throw new BadRequestException('Upload your photo again.');
      }
    }
    await this.db.query(
      `insert into journal_authors
         (user_id, display_name, title, bio, photo_media_id)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update
         set display_name = $2, title = $3, bio = $4, photo_media_id = $5,
             updated_at = now()`,
      [
        viewer.id,
        dto.displayName.trim(),
        dto.title?.trim() || null,
        dto.bio?.trim() || null,
        dto.photoMediaId ?? null,
      ],
    );
  }

  // ---- Comments to check

  async commentQueue() {
    const found = await this.db.query<{
      id: string;
      body: string;
      status: string;
      author_name: string;
      article_title: string;
      article_slug: string;
      created_at: Date;
      reasons: string[] | null;
    }>(
      `select m.id, m.body, m.status, u.full_name as author_name,
              a.title as article_title, a.slug as article_slug, m.created_at,
              (select array_agg(p.reason order by p.created_at)
               from journal_comment_reports p
               where p.comment_id = m.id and p.resolved_at is null) as reasons
       from journal_comments m
       join users u on u.id = m.author_id
       join journal_articles a on a.id = m.article_id
       where m.status = 'pending'
          or (m.status in ('active', 'hidden')
              and exists (select 1 from journal_comment_reports p
                          where p.comment_id = m.id
                            and p.resolved_at is null))
       order by m.created_at limit 200`,
    );
    return found.rows.map((m) => ({
      id: m.id,
      body: m.body,
      waiting: m.status === 'pending',
      hidden: m.status === 'hidden',
      by: displayName(m.author_name),
      article: { title: m.article_title, slug: m.article_slug },
      reports: m.reasons ?? [],
      at: m.created_at,
    }));
  }

  async moderateComment(
    viewer: SessionUser,
    commentId: string,
    action: 'approve' | 'hide',
  ) {
    await this.db.tx(async (client) => {
      const updated = await client.query(
        `update journal_comments
         set status = $2, moderated_by = $3, moderated_at = now()
         where id = $1 and status <> 'removed' and author_id <> $3`,
        [commentId, action === 'approve' ? 'active' : 'hidden', viewer.id],
      );
      if (updated.rowCount === 0) {
        throw new NotFoundException('We could not find that comment.');
      }
      await client.query(
        `update journal_comment_reports set resolved_at = now()
         where comment_id = $1 and resolved_at is null`,
        [commentId],
      );
      await this.audit.record(client, {
        actorId: viewer.id,
        action:
          action === 'approve' ? 'journal.comment_shown' : 'journal.comment_hidden',
        objectType: 'journal_comment',
        objectId: commentId,
      });
    });
  }

  // ---- Emails to followers

  /** Tells followers of a category about an article that has just gone live. */
  async notifyFollowers() {
    const due = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      body: string;
      category_key: string;
      category_label: string;
    }>(
      // Claimed in one statement so two API processes cannot both send.
      // Anything that went live more than a day ago is skipped, not sent late.
      `update journal_articles a set notified_at = now()
       from journal_categories c
       where c.key = a.category_key and a.notified_at is null and ${LIVE}
       returning a.id, a.slug, a.title, a.summary, a.body, a.category_key,
                 c.label as category_label,
                 (a.published_at > now() - interval '1 day') as fresh`,
    );
    let sent = 0;
    for (const article of due.rows) {
      if (!(article as unknown as { fresh: boolean }).fresh) continue;
      const people = await this.db.query<{
        id: string;
        email: string;
        full_name: string;
      }>(
        `select u.id, u.email, u.full_name from journal_subscriptions s
         join users u on u.id = s.user_id
         where s.category_key = $1 and u.status = 'active'
           and u.email_verified_at is not null`,
        [article.category_key],
      );
      const preview =
        article.summary || `${plainText(article.body).slice(0, 220)}…`;
      for (const person of people.rows) {
        await this.mail.send({
          to: person.email,
          subject: `${article.category_label}: ${article.title}`,
          paragraphs: [
            `Hello ${person.full_name},`,
            preview,
            `You get this because you follow ${article.category_label}. To stop, open: ${config.webUrl}/journal/unsubscribe#${unsubscribeToken(person.id, article.category_key)}`,
          ],
          action: {
            label: 'Read the article',
            url: `${config.webUrl}/journal/${article.slug}`,
          },
          idempotencyKey: `journal-${article.id}-${person.id}`,
        });
        sent += 1;
      }
    }
    return sent;
  }

  // ---- Helpers

  private async move(
    viewer: SessionUser,
    id: string,
    decide: (row: ArticleRow) => {
      status: string;
      action: string;
      reviewer?: string;
      note?: string | null;
      publishedAt?: Date | null;
      reason?: string;
    },
  ) {
    await this.db.tx(async (client) => {
      const row = await this.find(client, id, true);
      const next = decide(row);
      await client.query(
        `update journal_articles
         set status = $2,
             reviewer_id = coalesce($3::uuid, reviewer_id),
             review_note = $4,
             published_at = case when $5::boolean then $6::timestamptz
                                 else published_at end,
             updated_at = now()
         where id = $1`,
        [
          id,
          next.status,
          next.reviewer ?? null,
          next.note === undefined ? row.review_note : next.note,
          next.publishedAt !== undefined,
          next.publishedAt ?? null,
        ],
      );
      await this.audit.record(client, {
        actorId: viewer.id,
        action: next.action,
        objectType: 'article',
        objectId: id,
        priorState: row.status,
        newState: next.status,
        reason: next.reason ?? next.note ?? undefined,
      });
    });
    return this.get(viewer, id);
  }

  private requireReady(row: ArticleRow) {
    const words = row.body.trim().split(/\s+/).filter(Boolean).length;
    if (words < MIN_BODY_WORDS) {
      throw new BadRequestException(
        `Write at least ${MIN_BODY_WORDS} words before you send it on.`,
      );
    }
    if (!row.summary.trim()) {
      throw new BadRequestException(
        'Add a summary. Readers see it in lists and in search.',
      );
    }
    if (row.kind !== 'story' && row.kind !== 'testimony' && row.scripture.length === 0) {
      throw new BadRequestException(
        'Add at least one scripture reference to a teaching or devotional.',
      );
    }
  }

  private requireEdit(row: ArticleRow, viewer: SessionUser) {
    const editor = viewer.role === 'editor' || viewer.role === 'admin';
    if (row.author_id !== viewer.id && !editor) {
      throw new ForbiddenException(
        'Only the author or an editor can change this article.',
      );
    }
  }

  private requireEditor(viewer: SessionUser) {
    if (viewer.role !== 'editor' && viewer.role !== 'admin') {
      throw new ForbiddenException('Only an editor can do that.');
    }
  }

  private fields(dto: ArticleDto) {
    return [
      dto.title.trim(),
      (dto.summary ?? '').trim(),
      dto.body ?? '',
      dto.kind,
      dto.categoryKey,
      [...new Set((dto.tags ?? []).map((t) => t.trim().toLowerCase()))],
      dto.coverMediaId ?? null,
      dto.coverAlt?.trim() || null,
      JSON.stringify(
        (dto.scripture ?? []).map((s) => ({
          ref: s.ref.trim(),
          text: s.text?.trim() || undefined,
          translation: s.text?.trim() ? s.translation : undefined,
        })),
      ),
      (dto.reflection ?? []).map((q) => q.trim()),
      dto.action ?? 'none',
      dto.seriesId ?? null,
      dto.seriesId ? (dto.seriesPosition ?? null) : null,
    ];
  }

  private async checkLinks(dto: ArticleDto) {
    const category = await this.db.query(
      'select 1 from journal_categories where key = $1 and enabled',
      [dto.categoryKey],
    );
    if (category.rowCount === 0) {
      throw new BadRequestException('Choose a category.');
    }
    if (dto.seriesId) {
      const series = await this.db.query(
        'select 1 from journal_series where id = $1',
        [dto.seriesId],
      );
      if (series.rowCount === 0) {
        throw new BadRequestException('Choose a series from the list.');
      }
    }
    if (dto.coverMediaId) {
      const media = await this.db.query(
        'select 1 from journal_media where id = $1',
        [dto.coverMediaId],
      );
      if (media.rowCount === 0) {
        throw new BadRequestException('Upload the cover picture again.');
      }
    }
  }

  private async freeSlug(client: Queryable, base: string, exceptId?: string) {
    const taken = await client.query<{ slug: string }>(
      `select slug from journal_articles
       where (slug = $1 or slug like $1 || '-%')
         and ($2::uuid is null or id <> $2)`,
      [base, exceptId ?? null],
    );
    const used = new Set(taken.rows.map((r) => r.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    return slug;
  }

  private async snapshot(
    client: PoolClient,
    id: string,
    viewer: SessionUser,
    note: string | null,
  ) {
    await client.query(
      `insert into journal_revisions
         (article_id, title, summary, body, scripture, note, edited_by)
       select id, title, summary, body, scripture, $2, $3
       from journal_articles where id = $1`,
      [id, note, viewer.id],
    );
  }

  private async find(client: Queryable, id: string, lock = false) {
    const found = await client.query<ArticleRow>(
      `${ARTICLE_SQL} where a.id = $1 ${lock ? 'for update of a' : ''}`,
      [id],
    );
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that article.');
    }
    return found.rows[0];
  }
}
