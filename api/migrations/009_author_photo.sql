alter table journal_authors add column photo_media_id uuid references journal_media(id);
