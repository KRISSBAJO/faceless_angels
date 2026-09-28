-- Accounts
alter table users add column status text not null default 'active';
alter table users add column must_change_password boolean not null default false;
alter table users add column email_verified_at timestamptz;
alter table users add column identity_status text not null default 'unverified';
alter table users add column identity_note text;
alter table users add column invited_by uuid references users(id);

-- One-time links: invites, email verification, password resets.
create table auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  email      text not null,
  user_id    uuid references users(id) on delete cascade,
  role       text,
  token_hash text not null unique,
  created_by uuid references users(id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_tokens_email_idx on auth_tokens (kind, email);

-- Identity papers live apart from case evidence.
create table identity_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  doc_type      text not null,
  original_name text not null,
  mime_type     text not null,
  size_bytes    integer not null,
  storage       text not null,
  storage_key   text not null,
  encryption    text,
  sha256        text not null,
  status        text not null default 'pending',
  review_note   text,
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  uploaded_at   timestamptz not null default now()
);

create index identity_documents_user_idx on identity_documents (user_id, uploaded_at);
create index identity_documents_status_idx on identity_documents (status, uploaded_at);

-- Files written before this migration are plain files on local disk.
alter table need_evidence add column storage text not null default 'local';
alter table need_evidence add column encryption text;

-- Need types and their limits, editable by an administrator.
create table need_categories (
  key               text primary key,
  label             text not null,
  description       text not null,
  enabled           boolean not null default true,
  max_amount_cents  integer not null check (max_amount_cents > 0),
  -- Null means this type cannot use the short request form.
  quick_max_cents   integer check (quick_max_cents > 0),
  requires_document boolean not null default true,
  sort              integer not null
);

insert into need_categories
  (key, label, description, max_amount_cents, quick_max_cents, requires_document, sort)
values
  ('utilities', 'Utility bill', 'Electricity, gas, or water.', 150000, null, true, 10),
  ('rent', 'Rent or housing', 'Rent, a late notice, or a deposit.', 300000, null, true, 20),
  ('groceries', 'Groceries', 'Food for your household.', 30000, 7500, false, 30),
  ('transportation', 'Transportation', 'Gas, bus fare, or a car repair.', 80000, 5000, false, 40),
  ('medical', 'Prescriptions or medical bills', 'Medicine, a co-pay, or a bill.', 150000, 6000, true, 50),
  ('school', 'School fees or supplies', 'Fees, uniforms, or supplies.', 50000, 6000, false, 60),
  ('childcare', 'Childcare', 'Daycare or after-school care.', 100000, null, true, 70),
  ('baby', 'Diapers and baby supplies', 'Diapers, formula, or wipes.', 20000, 6000, false, 80),
  ('household', 'Household and hygiene essentials', 'Soap, toiletries, or cleaning supplies.', 20000, 5000, false, 90),
  ('clothing', 'Clothing and shoes', 'Work clothes, school clothes, or a coat.', 20000, 6000, false, 100),
  ('phone_internet', 'Phone or internet bill', 'A bill to keep you connected.', 30000, null, true, 110),
  ('shelter', 'Emergency shelter', 'A few nights in a hotel or shelter.', 100000, null, false, 120),
  ('funeral', 'Funeral costs', 'Costs after a death in the family.', 300000, null, true, 130),
  ('other', 'Something else', 'A need that does not fit the list.', 50000, 5000, false, 140);

-- The agreement wording. Each change is a new version; old ones are kept.
create table policy_texts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  version    integer not null,
  body       text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (kind, version)
);

insert into policy_texts (kind, version, body) values
  ('consent', 1, 'I agree that Faceless Angels may review this request and confirm the balance with the provider.'),
  ('attestation', 1, 'Everything I have written is true, and I have listed all other help I asked for or received for this need.');

-- Requests
alter table cases add column kind text not null default 'standard';
alter table cases add column consent_text_id uuid references policy_texts(id);
alter table cases add column attestation_text_id uuid references policy_texts(id);
alter table cases alter column due_date drop not null;
alter table cases alter column provider_name drop not null;
alter table cases alter column consequence drop not null;
alter table cases alter column recurrence drop not null;

-- Some audited things, like a need type, have a text key and no uuid.
alter table audit_events alter column object_id drop not null;
alter table audit_events add column object_key text;
create index audit_events_action_idx on audit_events (action, id);
