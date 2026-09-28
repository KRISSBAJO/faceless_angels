alter table cases add column assigned_reviewer_id uuid references users(id);

create index cases_state_idx on cases (state, submitted_at);

create table verification_checks (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references cases(id),
  claim      text not null,
  result     text not null,
  method     text not null,
  note       text,
  actor_id   uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index verification_checks_case_idx on verification_checks (case_id, created_at);

create table decisions (
  id                    uuid primary key default gen_random_uuid(),
  case_id               uuid not null references cases(id),
  kind                  text not null,
  outcome               text not null,
  approved_amount_cents integer check (approved_amount_cents > 0),
  payment_destination   text,
  expires_on            date,
  reason_code           text,
  rationale             text not null,
  restrictions          text,
  policy_version        text not null,
  decided_by            uuid not null references users(id),
  decided_at            timestamptz not null default now(),
  -- One first decision and at most one appeal decision per case.
  unique (case_id, kind)
);

create table case_messages (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references cases(id),
  author_id  uuid not null references users(id),
  kind       text not null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index case_messages_case_idx on case_messages (case_id, created_at);
