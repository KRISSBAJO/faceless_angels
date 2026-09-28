-- Public-domain Bible text, loaded from api/data/bible when the API starts.
create table bible_verses (
  translation text not null,
  book        smallint not null check (book between 1 and 66),
  chapter     smallint not null,
  verse       smallint not null,
  text        text not null,
  primary key (translation, book, chapter, verse)
);
