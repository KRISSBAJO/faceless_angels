create table journal_categories (
  key         text primary key,
  label       text not null,
  description text not null,
  sort        integer not null,
  enabled     boolean not null default true
);

insert into journal_categories (key, label, description, sort) values
  ('daily_bread', 'Daily Bread', 'A short devotional for the day.', 10),
  ('bible_study', 'Bible Study', 'Deeper teaching, passage by passage.', 20),
  ('christian_living', 'Christian Living', 'Following Christ in ordinary life.', 30),
  ('prayer', 'Prayer', 'Learning to pray, alone and together.', 40),
  ('family', 'Family', 'Marriage, children, and the home.', 50),
  ('faith_and_work', 'Faith and Work', 'Serving God in your daily work.', 60),
  ('finances', 'Finances', 'Money, generosity, and getting through hard times.', 70),
  ('young_believers', 'Young Believers', 'First steps in the faith.', 80),
  ('testimonies', 'Testimonies', 'What God has done, told by those who saw it.', 90),
  ('angel_stories', 'Angel Stories', 'True stories of quiet help, shared with consent.', 100);

-- What a byline shows. Separate from the account, so a legal name stays private.
create table journal_authors (
  user_id      uuid primary key references users(id),
  display_name text not null,
  title        text,
  bio          text,
  updated_at   timestamptz not null default now()
);

-- Cover images. These are public, so they are stored as they are.
create table journal_media (
  id          uuid primary key default gen_random_uuid(),
  storage     text not null,
  storage_key text not null,
  mime_type   text not null,
  size_bytes  integer not null,
  uploaded_by uuid not null references users(id),
  created_at  timestamptz not null default now()
);

create table journal_series (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text not null,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now()
);

create table journal_articles (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  summary         text not null default '',
  body            text not null default '',
  -- teaching: editorial. testimony and story: what happened to real people.
  kind            text not null default 'teaching',
  category_key    text not null references journal_categories(key),
  tags            text[] not null default '{}',
  cover_media_id  uuid references journal_media(id),
  cover_alt       text,
  -- [{ "ref": "Matthew 6:3-4", "text": "..." }]
  scripture       jsonb not null default '[]',
  reflection      text[] not null default '{}',
  -- What the reader is invited to do at the end: pray, give, ask, group, none.
  action          text not null default 'none',
  series_id       uuid references journal_series(id),
  series_position integer,
  author_id       uuid not null references users(id),
  reviewer_id     uuid references users(id),
  -- draft, in_review, changes_requested, approved, published, archived
  status          text not null default 'draft',
  review_note     text,
  -- In the future means scheduled. Readers see it once the time comes.
  published_at    timestamptz,
  featured        boolean not null default false,
  allow_comments  boolean not null default true,
  reading_minutes integer not null default 1,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search          tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', summary), 'B') ||
    setweight(to_tsvector('english', body), 'C')
  ) stored
);

create index journal_articles_live_idx on journal_articles (published_at desc)
  where status = 'published';
create index journal_articles_category_idx on journal_articles (category_key, published_at desc);
create index journal_articles_series_idx on journal_articles (series_id, series_position);
create index journal_articles_search_idx on journal_articles using gin (search);
create index journal_articles_tags_idx on journal_articles using gin (tags);

-- A copy of the words each time they are saved, so nothing is lost.
create table journal_revisions (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal_articles(id),
  title      text not null,
  summary    text not null,
  body       text not null,
  scripture  jsonb not null,
  note       text,
  edited_by  uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index journal_revisions_article_idx on journal_revisions (article_id, created_at desc);

-- Shown to readers under a published article.
create table journal_corrections (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal_articles(id),
  body       text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table journal_reactions (
  article_id uuid not null references journal_articles(id),
  user_id    uuid not null references users(id),
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id, kind)
);

create table journal_bookmarks (
  article_id uuid not null references journal_articles(id),
  user_id    uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

create table journal_reads (
  article_id  uuid not null references journal_articles(id),
  user_id     uuid not null references users(id),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  primary key (article_id, user_id)
);

create table journal_views (
  article_id uuid not null references journal_articles(id),
  day        date not null,
  views      integer not null default 0,
  primary key (article_id, day)
);

create table journal_comments (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references journal_articles(id),
  parent_id    uuid references journal_comments(id),
  author_id    uuid not null references users(id),
  body         text not null,
  -- pending, active, hidden, removed
  status       text not null,
  moderated_by uuid references users(id),
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);

create index journal_comments_article_idx on journal_comments (article_id, created_at);
create index journal_comments_queue_idx on journal_comments (status, created_at);

create table journal_comment_reports (
  comment_id  uuid not null references journal_comments(id),
  reporter_id uuid not null references users(id),
  reason      text not null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);

-- A reader's own thoughts on an article. No one else can read them.
create table journal_notes (
  article_id uuid not null references journal_articles(id),
  user_id    uuid not null references users(id),
  body       text not null,
  updated_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

-- Email when something new is published in a category.
create table journal_subscriptions (
  user_id      uuid not null references users(id),
  category_key text not null references journal_categories(key),
  created_at   timestamptz not null default now(),
  primary key (user_id, category_key)
);
