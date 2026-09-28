-- Keep only each group's own rules. The platform's code of conduct is added
-- when the rules are shown, so a change to it reaches every group at once.
alter table prayer_groups add column group_rules text;

update prayer_groups
set group_rules = nullif(trim(substring(
  code_of_conduct from position(E'\n\n' in code_of_conduct) + 2)), '')
where position(E'\n\n' in code_of_conduct) > 0;

alter table prayer_groups drop column code_of_conduct;

-- A site moderator can suspend a group while a complaint is looked at.
-- status is now one of: pending, active, suspended, closed.
alter table prayer_groups add column status_note text;
alter table prayer_groups add column status_changed_by uuid references users(id);
alter table prayer_groups add column status_changed_at timestamptz;

-- Reports can now be about a member or about the group itself. Those go to
-- site moderators, never to the group's own admins.
alter table prayer_reports add column category text not null default 'other';
