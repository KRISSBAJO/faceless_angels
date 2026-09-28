-- How often an article was shared, and where. Counts only, never who.
create table journal_shares (
  article_id uuid not null references journal_articles(id),
  day        date not null,
  channel    text not null,
  shares     integer not null default 0,
  primary key (article_id, day, channel)
);
