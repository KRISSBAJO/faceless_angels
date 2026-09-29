-- Gifts that support the running of Faceless Angels, and the public record
-- of where money goes. Amounts are kept in the currency's smallest unit
-- (cents, kobo). US dollars and naira are never added together.

-- A visit to the payment page. It becomes a gift only when the payment
-- company confirms it to the server.
create table donation_checkouts (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('stripe', 'paystack')),
  currency          text not null check (currency in ('usd', 'ngn')),
  kind              text not null check (kind in ('one_time', 'monthly')),
  amount_minor      bigint not null check (amount_minor > 0),
  email             text not null,
  user_id           uuid references users(id),
  provider_session  text,
  status            text not null default 'open'
                    check (status in ('open', 'paid', 'expired')),
  livemode          boolean not null,
  created_at        timestamptz not null default now()
);

-- A monthly gift. Each month's payment is a row in donations.
create table recurring_gifts (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_ref       text not null,
  -- Paystack needs this token to stop a subscription.
  provider_token     text,
  currency           text not null,
  amount_minor       bigint not null,
  email              text not null,
  user_id            uuid references users(id),
  checkout_id        uuid references donation_checkouts(id),
  status             text not null default 'active'
                     check (status in ('active', 'cancelled')),
  livemode           boolean not null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  unique (provider, provider_ref)
);

-- A gift the payment company has confirmed. Never created from the browser.
create table donations (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_ref       text not null,
  kind               text not null check (kind in ('one_time', 'monthly')),
  currency           text not null,
  amount_minor       bigint not null check (amount_minor > 0),
  fee_minor          bigint,
  refunded_minor     bigint not null default 0,
  status             text not null default 'succeeded'
                     check (status in ('succeeded', 'refunded', 'disputed')),
  email              text,
  user_id            uuid references users(id),
  checkout_id        uuid references donation_checkouts(id),
  recurring_id       uuid references recurring_gifts(id),
  livemode           boolean not null,
  received_at        timestamptz not null,
  receipt_sent_at    timestamptz,
  created_at         timestamptz not null default now(),
  unique (provider, provider_ref)
);

create index donations_received_idx on donations (livemode, currency, received_at);
create index donations_user_idx on donations (user_id, received_at desc);

-- Monthly plans made at Paystack, one per amount, so they are reused.
create table giving_plans (
  provider     text not null,
  currency     text not null,
  amount_minor bigint not null,
  livemode     boolean not null,
  plan_code    text not null,
  primary key (provider, currency, amount_minor, livemode)
);

-- Money going out: the cost of running Faceless Angels, and help paid to
-- people in need. Each entry needs a receipt and a second person's approval
-- before it counts or is shown to the public.
create table ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('expense', 'help')),
  -- For expenses, one of the cost categories. For help, a need type.
  category        text not null,
  description     text not null,
  payee           text not null,
  currency        text not null check (currency in ('usd', 'ngn')),
  amount_minor    bigint not null check (amount_minor > 0),
  paid_on         date not null,
  case_id         uuid references cases(id),
  receipt_storage text,
  receipt_key     text,
  receipt_encryption text,
  receipt_mime    text,
  receipt_name    text,
  status          text not null default 'proposed'
                  check (status in ('proposed', 'approved', 'rejected')),
  proposed_by     uuid not null references users(id),
  decided_by      uuid references users(id),
  decision_note   text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  check (decided_by is null or decided_by <> proposed_by)
);

create index ledger_entries_public_idx on ledger_entries (status, currency, paid_on);

-- The time each payment company last reached us, shown to staff.
create table giving_webhooks (
  provider     text primary key,
  last_event   text not null,
  received_at  timestamptz not null
);
