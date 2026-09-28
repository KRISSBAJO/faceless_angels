create table prayer_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text not null,
  theme            text,
  language         text not null default 'English',
  church           text,
  city             text,
  region           text,
  meets_online     boolean not null default true,
  timezone         text not null default 'America/Chicago',
  schedule         text,
  -- open: anyone may join. apply: a leader approves each person.
  -- invite: listed, but joined by invitation. private: not listed at all.
  access           text not null default 'open',
  -- pending until a prayer moderator approves it; closed when it ends.
  status           text not null default 'pending',
  code_of_conduct  text not null,
  membership_rules text,
  decline_note     text,
  created_by       uuid not null references users(id),
  approved_by      uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index prayer_groups_listed_idx on prayer_groups (status, access);

create table prayer_group_members (
  group_id         uuid not null references prayer_groups(id),
  user_id          uuid not null references users(id),
  -- leader, moderator, member
  role             text not null default 'member',
  -- active, applied, invited, removed, left
  status           text not null,
  accepted_code_at timestamptz,
  joined_at        timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index prayer_group_members_user_idx on prayer_group_members (user_id, status);

create table prayer_sessions (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references prayer_groups(id),
  host_id          uuid not null references users(id),
  -- Sessions made together as a weekly series share this.
  series_id        uuid,
  title            text not null,
  starts_at        timestamptz not null,
  timezone         text not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 600),
  capacity         integer check (capacity > 0),
  provider         text,
  url              text,
  -- The provider's own id for the meeting, once a provider integration makes them.
  external_ref     text,
  place            text,
  notes            text,
  reminder_sent_at timestamptz,
  cancelled_at     timestamptz,
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now()
);

create index prayer_sessions_group_idx on prayer_sessions (group_id, starts_at);
create index prayer_sessions_reminder_idx on prayer_sessions (starts_at)
  where reminder_sent_at is null and cancelled_at is null;

create table prayer_session_attendees (
  session_id uuid not null references prayer_sessions(id),
  user_id    uuid not null references users(id),
  -- The person agreed that the host may see they plan to attend.
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table prayer_requests (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references users(id),
  body             text not null,
  -- personal: only me. group: one group. team: the prayer team. network: all members.
  audience         text not null,
  group_id         uuid references prayer_groups(id),
  show_name        boolean not null default false,
  allow_responses  boolean not null default true,
  allow_forward    boolean not null default false,
  allow_follow     boolean not null default true,
  -- pending (waiting for a moderator), active, hidden, answered, withdrawn
  status           text not null,
  needs_care       boolean not null default false,
  expires_at       timestamptz not null,
  forwarded_at     timestamptz,
  forwarded_by     uuid references users(id),
  testimony        text,
  -- pending, approved, declined. Set only when the author asked to publish.
  testimony_status text,
  moderated_by     uuid references users(id),
  moderated_at     timestamptz,
  moderation_note  text,
  answered_at      timestamptz,
  edited_at        timestamptz,
  created_at       timestamptz not null default now(),
  check (audience <> 'group' or group_id is not null)
);

create index prayer_requests_author_idx on prayer_requests (author_id, created_at desc);
create index prayer_requests_wall_idx on prayer_requests (audience, status, created_at desc);
create index prayer_requests_group_idx on prayer_requests (group_id, created_at desc);

create table prayer_responses (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references prayer_requests(id),
  author_id    uuid not null references users(id),
  body         text not null,
  -- pending, active, hidden
  status       text not null,
  moderated_by uuid references users(id),
  moderated_at timestamptz,
  created_at   timestamptz not null default now()
);

create index prayer_responses_request_idx on prayer_responses (request_id, created_at);

create table prayer_supports (
  request_id uuid not null references prayer_requests(id),
  user_id    uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table prayer_follows (
  request_id uuid not null references prayer_requests(id),
  user_id    uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table prayer_reports (
  id          uuid primary key default gen_random_uuid(),
  -- request or response
  target_type text not null,
  target_id   uuid not null,
  -- Set when the content belongs to a group, so its leaders review it.
  group_id    uuid references prayer_groups(id),
  reporter_id uuid not null references users(id),
  reason      text not null,
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  outcome     text,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

create index prayer_reports_open_idx on prayer_reports (group_id, created_at)
  where resolved_at is null;

-- Someone who no longer wants to see what another person writes.
create table prayer_blocks (
  blocker_id uuid not null references users(id),
  blocked_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
