-- How the requester allows the need to be shown. A reviewer may list it more
-- privately than this, never more publicly.
alter table cases add column listing_preference text not null default 'angels_only';

-- Set when a reviewer lists the need.
alter table cases add column visibility text;
alter table cases add column public_summary text;
alter table cases add column published_at timestamptz;

create index cases_published_idx on cases (published_at) where state = 'published';

-- The name an Angel is known by. Given at their first pledge.
create sequence angel_ref_seq start 1001;
alter table users add column angel_ref text unique;

-- A pledge is a promise to give. No money moves.
create table pledges (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases(id),
  angel_id     uuid not null references users(id),
  amount_cents integer not null check (amount_cents > 0),
  status       text not null default 'active',
  ended_reason text,
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create index pledges_case_idx on pledges (case_id) where status = 'active';
create index pledges_angel_idx on pledges (angel_id, created_at desc);
