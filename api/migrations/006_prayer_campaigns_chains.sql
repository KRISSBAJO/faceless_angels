-- A campaign is a group praying about one thing for a set number of days.
create table prayer_campaigns (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references prayer_groups(id),
  title        text not null,
  purpose      text not null,
  scripture    text,
  starts_on    date not null,
  ends_on      date not null,
  created_by   uuid not null references users(id),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index prayer_campaigns_group_idx on prayer_campaigns (group_id, starts_on);

create table prayer_campaign_members (
  campaign_id uuid not null references prayer_campaigns(id),
  user_id     uuid not null references users(id),
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- One row for each day a member says they prayed. Seen by that member only.
create table prayer_campaign_days (
  campaign_id uuid not null references prayer_campaigns(id),
  user_id     uuid not null references users(id),
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id, day)
);

-- A chain is unbroken prayer over a stretch of time, taken in turns.
create table prayer_chains (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references prayer_groups(id),
  title        text not null,
  purpose      text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  slot_minutes integer not null check (slot_minutes in (15, 30, 60)),
  timezone     text not null,
  created_by   uuid not null references users(id),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index prayer_chains_group_idx on prayer_chains (group_id, starts_at);

create table prayer_chain_slots (
  chain_id         uuid not null references prayer_chains(id),
  slot_start       timestamptz not null,
  user_id          uuid not null references users(id),
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (chain_id, slot_start, user_id)
);

create index prayer_chain_slots_reminder_idx on prayer_chain_slots (slot_start)
  where reminder_sent_at is null;
