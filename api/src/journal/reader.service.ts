import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.service';
import { DbService } from '../db/db.service';
import { displayName } from '../prayer/prayer.shared';
import {
  isJournalStaff,
  plainText,
  REACTIONS,
  readUnsubscribeToken,
} from './journal.shared';

const PAGE = 12;
const AUTO_HIDE_AFTER_REPORTS = 3;

/** True for an article readers can see now. Scheduled ones are not yet. */
export const LIVE = `a.status = 'published' and a.published_at <= now()`;

export interface CardRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  category_key: string;
  category_label: string;
  tags: string[];
  cover_media_id: string | null;
  cover_alt: string | null;
  published_at: Date | null;
  reading_minutes: number;
  featured: boolean;
  series_slug: string | null;
  series_title: string | null;
  series_position: number | null;
  author_id: string;
  author_name: string;
  author_title: string | null;
  author_photo: string | null;
  author_full_name: string;
  snippet?: string | null;
}

export const CARD_SQL = `
  select a.id, a.slug, a.title, a.summary, a.kind, a.category_key,
         c.label as category_label, a.tags, a.cover_media_id, a.cover_alt,
         a.published_at, a.reading_minutes, a.featured,
         s.slug as series_slug, s.title as series_title, a.series_position,
         a.author_id, ja.display_name as author_name,
         ja.title as author_title, ja.photo_media_id as author_photo,
         u.full_name as author_full_name`;

export const CARD_FROM = `
  from journal_articles a
  join journal_categories c on c.key = a.category_key
  join users u on u.id = a.author_id
  left join journal_authors ja on ja.user_id = a.author_id
  left join journal_series s on s.id = a.series_id`;

export function card(row: CardRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    category: { key: row.category_key, label: row.category_label },
    tags: row.tags,
    cover: row.cover_media_id
      ? { id: row.cover_media_id, alt: row.cover_alt ?? '' }
      : null,
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
    featured: row.featured,
    series: row.series_slug
      ? {
          slug: row.series_slug,
          title: row.series_title,
          position: row.series_position,
        }
      : null,
    author: {
      id: row.author_id,
      // Without a byline set, the account's first name and initial is used.
      name: row.author_name ?? displayName(row.author_full_name),
      title: row.author_title,
      photo: row.author_photo,
    },
    snippet: row.snippet ?? null,
  };
}

@Injectable()
export class JournalReaderService {
  constructor(private readonly db: DbService) {}

  async home() {
    const [featured, daily, latest, categories, series] = await Promise.all([
      this.db.query<CardRow>(
        `${CARD_SQL} ${CARD_FROM}
         where ${LIVE} and a.featured
         order by a.published_at desc limit 1`,
      ),
      this.db.query<CardRow>(
        `${CARD_SQL} ${CARD_FROM}
         where ${LIVE} and a.category_key = 'daily_bread'
         order by a.published_at desc limit 1`,
      ),
      this.db.query<CardRow>(
        `${CARD_SQL} ${CARD_FROM}
         where ${LIVE} order by a.published_at desc limit 13`,
      ),
      this.categories(),
      this.seriesList(),
    ]);
    const lead = featured.rows[0] ?? latest.rows[0];
    return {
      featured: lead ? card(lead) : null,
      dailyBread: daily.rows[0] ? card(daily.rows[0]) : null,
      latest: latest.rows
        .filter((row) => row.id !== lead?.id)
        .slice(0, 12)
        .map(card),
      categories,
      series,
    };
  }

  async categories() {
    const found = await this.db.query<{
      key: string;
      label: string;
      description: string;
      articles: number;
    }>(
      `select c.key, c.label, c.description,
              (select count(*)::int from journal_articles a
               where a.category_key = c.key and ${LIVE}) as articles
       from journal_categories c where c.enabled
       order by c.sort, c.label`,
    );
    return found.rows;
  }

  async seriesList() {
    const found = await this.db.query<{
      slug: string;
      title: string;
      description: string;
      articles: number;
    }>(
      `select s.slug, s.title, s.description,
              (select count(*)::int from journal_articles a
               where a.series_id = s.id and ${LIVE}) as articles
       from journal_series s
       where exists (select 1 from journal_articles a
                     where a.series_id = s.id and ${LIVE})
       order by s.created_at desc`,
    );
    return found.rows;
  }

  async list(filters: {
    category?: string;
    tag?: string;
    series?: string;
    author?: string;
    kind?: string;
    q?: string;
    page?: number;
  }) {
    const q = filters.q?.trim().slice(0, 120) || null;
    const page = Math.min(Math.max(filters.page ?? 1, 1), 200);
    const found = await this.db.query<CardRow & { total: number }>(
      `${CARD_SQL},
         case when $6::text is null then null else
           ts_headline('english', a.summary || ' ' || left(a.body, 4000),
             websearch_to_tsquery('english', $6),
             'MaxWords=30, MinWords=12, StartSel=<<, StopSel=>>')
         end as snippet,
         count(*) over ()::int as total
       ${CARD_FROM}
       where ${LIVE}
         and ($1::text is null or a.category_key = $1)
         and ($2::text is null or $2 = any(a.tags))
         and ($3::text is null or s.slug = $3)
         and ($4::uuid is null or a.author_id = $4)
         and ($5::text is null or a.kind = $5)
         and ($6::text is null
              or a.search @@ websearch_to_tsquery('english', $6))
       order by
         case when $6::text is null then 0 else
           ts_rank(a.search, websearch_to_tsquery('english', $6)) end desc,
         case when $3::text is null then null else a.series_position end,
         a.published_at desc
       limit ${PAGE} offset $7`,
      [
        filters.category || null,
        filters.tag?.toLowerCase() || null,
        filters.series || null,
        /^[0-9a-f-]{36}$/i.test(filters.author ?? '') ? filters.author : null,
        filters.kind || null,
        q,
        (page - 1) * PAGE,
      ],
    );
    const total = found.rows[0]?.total ?? 0;
    return {
      articles: found.rows.map((row) => ({
        ...card(row),
        snippet: row.snippet ? plainText(row.snippet) : null,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
    };
  }

  async series(slug: string) {
    const found = await this.db.query<{
      slug: string;
      title: string;
      description: string;
    }>('select slug, title, description from journal_series where slug = $1', [
      slug,
    ]);
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that series.');
    }
    const articles = await this.db.query<CardRow>(
      `${CARD_SQL} ${CARD_FROM}
       where ${LIVE} and s.slug = $1
       order by a.series_position nulls last, a.published_at`,
      [slug],
    );
    return { ...found.rows[0], articles: articles.rows.map(card) };
  }

  async author(authorId: string) {
    const found = await this.db.query<{
      full_name: string;
      display_name: string | null;
      title: string | null;
      bio: string | null;
      photo_media_id: string | null;
      articles: number;
    }>(
      `select u.full_name, ja.display_name, ja.title, ja.bio,
              ja.photo_media_id,
              (select count(*)::int from journal_articles a
               where a.author_id = u.id and ${LIVE}) as articles
       from users u left join journal_authors ja on ja.user_id = u.id
       where u.id = $1
         and exists (select 1 from journal_articles a
                     where a.author_id = u.id and ${LIVE})`,
      [authorId],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException('We could not find that author.');
    return {
      id: authorId,
      name: row.display_name ?? displayName(row.full_name),
      title: row.title,
      bio: row.bio,
      photo: row.photo_media_id,
      articles: row.articles,
    };
  }

  /** One article, with everything the page shows. Staff may read unpublished ones. */
  async article(viewer: SessionUser | undefined, slug: string) {
    const found = await this.db.query<
      CardRow & {
        body: string;
        scripture: { ref: string; text?: string }[];
        reflection: string[];
        action: string;
        allow_comments: boolean;
        status: string;
        series_id: string | null;
        author_bio: string | null;
        reviewer_name: string | null;
        updated_at: Date;
        live: boolean;
      }
    >(
      `${CARD_SQL}, a.body, a.scripture, a.reflection, a.action,
         a.allow_comments, a.status, a.series_id, ja.bio as author_bio,
         coalesce(jr.display_name, r.full_name) as reviewer_name,
         a.updated_at, (${LIVE}) as live
       ${CARD_FROM}
       left join users r on r.id = a.reviewer_id
       left join journal_authors jr on jr.user_id = a.reviewer_id
       where a.slug = $1`,
      [slug],
    );
    const row = found.rows[0];
    if (!row || (!row.live && !isJournalStaff(viewer))) {
      throw new NotFoundException('We could not find that article.');
    }

    const [corrections, reactions, siblings, related, mine, comments] =
      await Promise.all([
        this.db.query<{ body: string; created_at: Date }>(
          `select body, created_at from journal_corrections
           where article_id = $1 order by created_at`,
          [row.id],
        ),
        this.db.query<{ kind: string; n: number }>(
          `select kind, count(*)::int as n from journal_reactions
           where article_id = $1 group by kind`,
          [row.id],
        ),
        row.series_id
          ? this.db.query<CardRow>(
              `${CARD_SQL} ${CARD_FROM}
               where ${LIVE} and a.series_id = $1
               order by a.series_position nulls last, a.published_at`,
              [row.series_id],
            )
          : Promise.resolve({ rows: [] as CardRow[] }),
        this.db.query<CardRow>(
          `${CARD_SQL} ${CARD_FROM}
           where ${LIVE} and a.id <> $1
             and (a.category_key = $2 or a.tags && $3::text[])
           order by (a.tags && $3::text[]) desc, a.published_at desc
           limit 3`,
          [row.id, row.category_key, row.tags],
        ),
        viewer ? this.mine(viewer, row.id, row.category_key) : null,
        this.db.query<{ n: number }>(
          `select count(*)::int as n from journal_comments
           where article_id = $1 and status = 'active'`,
          [row.id],
        ),
      ]);

    const order = siblings.rows.map((s) => s.id);
    const at = order.indexOf(row.id);
    const counts = Object.fromEntries(REACTIONS.map((kind) => [kind, 0]));
    for (const r of reactions.rows) counts[r.kind] = r.n;

    return {
      ...card(row),
      body: row.body,
      scripture: row.scripture,
      reflection: row.reflection,
      action: row.action,
      allowComments: row.allow_comments,
      live: row.live,
      status: row.status,
      updatedAt: row.updated_at,
      reviewedBy: row.reviewer_name,
      author: { ...card(row).author, bio: row.author_bio },
      corrections: corrections.rows.map((c) => ({
        body: c.body,
        at: c.created_at,
      })),
      reactions: counts,
      comments: comments.rows[0].n,
      seriesArticles: siblings.rows.map((s) => ({
        slug: s.slug,
        title: s.title,
        position: s.series_position,
        current: s.id === row.id,
      })),
      previous: at > 0 ? card(siblings.rows[at - 1]) : null,
      next:
        at >= 0 && at < order.length - 1 ? card(siblings.rows[at + 1]) : null,
      related: related.rows.map(card),
      mine,
    };
  }

  private async mine(viewer: SessionUser, articleId: string, category: string) {
    const [reacted, saved, read, note, follows] = await Promise.all([
      this.db.query<{ kind: string }>(
        `select kind from journal_reactions
         where article_id = $1 and user_id = $2`,
        [articleId, viewer.id],
      ),
      this.db.query(
        `select 1 from journal_bookmarks
         where article_id = $1 and user_id = $2`,
        [articleId, viewer.id],
      ),
      this.db.query<{ finished_at: Date | null }>(
        `select finished_at from journal_reads
         where article_id = $1 and user_id = $2`,
        [articleId, viewer.id],
      ),
      this.db.query<{ body: string; updated_at: Date }>(
        `select body, updated_at from journal_notes
         where article_id = $1 and user_id = $2`,
        [articleId, viewer.id],
      ),
      this.db.query(
        `select 1 from journal_subscriptions
         where user_id = $1 and category_key = $2`,
        [viewer.id, category],
      ),
    ]);
    return {
      reactions: reacted.rows.map((r) => r.kind),
      saved: saved.rowCount !== 0,
      finished: read.rows[0]?.finished_at != null,
      note: note.rows[0]?.body ?? '',
      followsCategory: follows.rowCount !== 0,
    };
  }

  // ---- What a reader does

  async viewed(viewer: SessionUser | undefined, articleId: string) {
    const live = await this.live(articleId);
    await this.db.query(
      `insert into journal_views (article_id, day, views)
       values ($1, current_date, 1)
       on conflict (article_id, day)
         do update set views = journal_views.views + 1`,
      [live.id],
    );
    if (viewer) {
      await this.db.query(
        `insert into journal_reads (article_id, user_id) values ($1, $2)
         on conflict do nothing`,
        [live.id, viewer.id],
      );
    }
  }

  async finished(viewer: SessionUser, articleId: string) {
    const live = await this.live(articleId);
    await this.db.query(
      `insert into journal_reads (article_id, user_id, finished_at)
       values ($1, $2, now())
       on conflict (article_id, user_id)
         do update set finished_at = coalesce(journal_reads.finished_at, now())`,
      [live.id, viewer.id],
    );
  }

  async react(viewer: SessionUser, articleId: string, kind: string, on: boolean) {
    const live = await this.live(articleId);
    await this.db.query(
      on
        ? `insert into journal_reactions (article_id, user_id, kind)
           values ($1, $2, $3) on conflict do nothing`
        : `delete from journal_reactions
           where article_id = $1 and user_id = $2 and kind = $3`,
      [live.id, viewer.id, kind],
    );
    const counts = await this.db.query<{ kind: string; n: number }>(
      `select kind, count(*)::int as n from journal_reactions
       where article_id = $1 group by kind`,
      [live.id],
    );
    const result = Object.fromEntries(REACTIONS.map((k) => [k, 0]));
    for (const r of counts.rows) result[r.kind] = r.n;
    return result;
  }

  async save(viewer: SessionUser, articleId: string, on: boolean) {
    const live = await this.live(articleId);
    await this.db.query(
      on
        ? `insert into journal_bookmarks (article_id, user_id)
           values ($1, $2) on conflict do nothing`
        : `delete from journal_bookmarks
           where article_id = $1 and user_id = $2`,
      [live.id, viewer.id],
    );
  }

  async note(viewer: SessionUser, articleId: string, body: string) {
    const live = await this.live(articleId);
    if (!body.trim()) {
      await this.db.query(
        'delete from journal_notes where article_id = $1 and user_id = $2',
        [live.id, viewer.id],
      );
      return;
    }
    await this.db.query(
      `insert into journal_notes (article_id, user_id, body)
       values ($1, $2, $3)
       on conflict (article_id, user_id)
         do update set body = $3, updated_at = now()`,
      [live.id, viewer.id, body],
    );
  }

  /** Saved articles, ones begun and not finished, and the reader's notes. */
  async library(viewer: SessionUser) {
    const [saved, reading, notes, follows] = await Promise.all([
      this.db.query<CardRow>(
        `${CARD_SQL} ${CARD_FROM}
         join journal_bookmarks b on b.article_id = a.id and b.user_id = $1
         where ${LIVE} order by b.created_at desc limit 100`,
        [viewer.id],
      ),
      this.db.query<CardRow>(
        `${CARD_SQL} ${CARD_FROM}
         join journal_reads r on r.article_id = a.id and r.user_id = $1
         where ${LIVE} and r.finished_at is null
         order by r.started_at desc limit 12`,
        [viewer.id],
      ),
      this.db.query<CardRow & { note: string; noted_at: Date }>(
        `${CARD_SQL}, n.body as note, n.updated_at as noted_at ${CARD_FROM}
         join journal_notes n on n.article_id = a.id and n.user_id = $1
         order by n.updated_at desc limit 100`,
        [viewer.id],
      ),
      this.db.query<{ key: string; label: string }>(
        `select c.key, c.label from journal_subscriptions s
         join journal_categories c on c.key = s.category_key
         where s.user_id = $1 order by c.sort`,
        [viewer.id],
      ),
    ]);
    return {
      saved: saved.rows.map(card),
      reading: reading.rows.map(card),
      notes: notes.rows.map((row) => ({
        article: card(row),
        note: row.note,
        at: row.noted_at,
      })),
      follows: follows.rows,
    };
  }

  async follow(viewer: SessionUser, category: string, on: boolean) {
    if (on && !viewer.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you ask for emails.',
        code: 'email_not_verified',
      });
    }
    const found = await this.db.query(
      'select 1 from journal_categories where key = $1 and enabled',
      [category],
    );
    if (found.rowCount === 0) {
      throw new NotFoundException('We could not find that category.');
    }
    await this.db.query(
      on
        ? `insert into journal_subscriptions (user_id, category_key)
           values ($1, $2) on conflict do nothing`
        : `delete from journal_subscriptions
           where user_id = $1 and category_key = $2`,
      [viewer.id, category],
    );
  }

  async unsubscribe(token: string) {
    const parsed = readUnsubscribeToken(token);
    if (!parsed) throw new BadRequestException('This link is not valid.');
    await this.db.query(
      // "all" in the link stops every Journal email to this person.
      `delete from journal_subscriptions
       where user_id = $1 and ($2 = 'all' or category_key = $2)`,
      [parsed.userId, parsed.category],
    );
  }

  // ---- Comments

  async comments(viewer: SessionUser | undefined, articleId: string) {
    const found = await this.db.query<{
      id: string;
      parent_id: string | null;
      author_id: string;
      author_name: string;
      byline: string | null;
      staff: boolean;
      body: string;
      status: string;
      created_at: Date;
    }>(
      `select m.id, m.parent_id, m.author_id, u.full_name as author_name,
              ja.display_name as byline,
              (u.role = any($3)) as staff, m.body, m.status, m.created_at
       from journal_comments m
       join users u on u.id = m.author_id
       left join journal_authors ja on ja.user_id = m.author_id
       where m.article_id = $1
         and (m.status = 'active'
              or (m.status = 'pending' and m.author_id = $2))
       order by m.created_at`,
      [articleId, viewer?.id ?? null, ['editor', 'pastor', 'admin']],
    );
    const shape = (m: (typeof found.rows)[number]) => ({
      id: m.id,
      by: m.byline ?? displayName(m.author_name),
      staff: m.staff,
      mine: m.author_id === viewer?.id,
      body: m.body,
      waiting: m.status === 'pending',
      at: m.created_at,
    });
    const top = found.rows.filter((m) => !m.parent_id);
    return top.map((m) => ({
      ...shape(m),
      replies: found.rows.filter((r) => r.parent_id === m.id).map(shape),
    }));
  }

  async comment(
    viewer: SessionUser,
    articleId: string,
    body: string,
    parentId: string | undefined,
  ) {
    if (!viewer.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you comment.',
        code: 'email_not_verified',
      });
    }
    const live = await this.live(articleId);
    if (!live.allow_comments) {
      throw new ForbiddenException('Comments are closed on this article.');
    }
    if (parentId) {
      const parent = await this.db.query<{ parent_id: string | null }>(
        `select parent_id from journal_comments
         where id = $1 and article_id = $2 and status = 'active'`,
        [parentId, live.id],
      );
      if (!parent.rows[0]) {
        throw new NotFoundException('That comment is no longer there.');
      }
      if (parent.rows[0].parent_id) {
        throw new BadRequestException('Reply to the first comment instead.');
      }
    }
    // Someone whose comment a moderator has approved before is trusted.
    // A first comment waits for a moderator.
    const trusted =
      isJournalStaff(viewer) ||
      (
        await this.db.query(
          `select 1 from journal_comments
           where author_id = $1 and status = 'active'
             and moderated_by is not null limit 1`,
          [viewer.id],
        )
      ).rowCount !== 0;
    const recent = await this.db.query<{ n: number }>(
      `select count(*)::int as n from journal_comments
       where author_id = $1 and created_at > now() - interval '10 minutes'`,
      [viewer.id],
    );
    if (recent.rows[0].n >= 8) {
      throw new ConflictException(
        'You are commenting very fast. Wait a few minutes.',
      );
    }
    await this.db.query(
      `insert into journal_comments
         (article_id, parent_id, author_id, body, status)
       values ($1, $2, $3, $4, $5)`,
      [live.id, parentId ?? null, viewer.id, body.trim(), trusted ? 'active' : 'pending'],
    );
    return { waiting: !trusted };
  }

  async removeComment(viewer: SessionUser, commentId: string) {
    const removed = await this.db.query(
      `update journal_comments set status = 'removed', body = ''
       where id = $1 and author_id = $2 and status <> 'removed'`,
      [commentId, viewer.id],
    );
    if (removed.rowCount === 0) {
      throw new NotFoundException('We could not find that comment.');
    }
  }

  async reportComment(viewer: SessionUser, commentId: string, reason: string) {
    const found = await this.db.query<{ author_id: string }>(
      `select author_id from journal_comments
       where id = $1 and status = 'active'`,
      [commentId],
    );
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that comment.');
    }
    if (found.rows[0].author_id === viewer.id) {
      throw new BadRequestException('You cannot report your own comment.');
    }
    await this.db.tx(async (client) => {
      const inserted = await client.query(
        `insert into journal_comment_reports (comment_id, reporter_id, reason)
         values ($1, $2, $3) on conflict do nothing`,
        [commentId, viewer.id, reason.trim()],
      );
      if (inserted.rowCount === 0) {
        throw new ConflictException('You already reported this.');
      }
      const open = await client.query<{ n: number }>(
        `select count(*)::int as n from journal_comment_reports
         where comment_id = $1 and resolved_at is null`,
        [commentId],
      );
      if (open.rows[0].n >= AUTO_HIDE_AFTER_REPORTS) {
        await client.query(
          `update journal_comments set status = 'hidden'
           where id = $1 and status = 'active'`,
          [commentId],
        );
      }
    });
  }

  private async live(articleId: string) {
    const found = await this.db.query<{ id: string; allow_comments: boolean }>(
      `select a.id, a.allow_comments from journal_articles a
       where a.id = $1 and ${LIVE}`,
      [articleId],
    );
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that article.');
    }
    return found.rows[0];
  }
}
