create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  full_name     text not null,
  role          text not null default 'requester',
  created_at    timestamptz not null default now()
);

create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create sequence case_ref_seq start 10001;

create table cases (
  id                     uuid primary key default gen_random_uuid(),
  public_ref             text not null unique default ('FA-' || nextval('case_ref_seq')),
  requester_id           uuid not null references users(id),
  category               text not null,
  state                  text not null default 'draft',
  what_happened          text not null,
  amount_requested_cents integer not null check (amount_requested_cents > 0),
  due_date               date not null,
  provider_name          text not null,
  already_paid_cents     integer not null default 0 check (already_paid_cents >= 0),
  other_assistance_cents integer not null default 0 check (other_assistance_cents >= 0),
  other_assistance_note  text,
  consequence            text not null,
  recurrence             text not null,
  city                   text not null,
  region                 text not null,
  consent_at             timestamptz,
  attested_at            timestamptz,
  submitted_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index cases_requester_idx on cases (requester_id, created_at desc);

create table need_evidence (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id),
  kind          text not null,
  original_name text not null,
  mime_type     text not null,
  size_bytes    integer not null,
  storage_key   text not null,
  sha256        text not null,
  uploaded_by   uuid not null references users(id),
  uploaded_at   timestamptz not null default now()
);

create index need_evidence_case_idx on need_evidence (case_id);
-- Lets a reviewer find the same document reused on another case.
create index need_evidence_sha256_idx on need_evidence (sha256);

create table audit_events (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,
  object_type text not null,
  object_id   uuid not null,
  prior_state text,
  new_state   text,
  reason      text,
  created_at  timestamptz not null default now()
);

create index audit_events_object_idx on audit_events (object_type, object_id, id);
