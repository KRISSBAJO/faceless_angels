-- What receipts and yearly statements need: who received the gift in law,
-- a number for each receipt, and a note of statements already sent.

-- The legal body behind each currency: the US body takes dollars, the
-- Nigerian body takes naira. Blank until each is registered.
create table giving_entities (
  currency            text primary key check (currency in ('usd', 'ngn')),
  legal_name          text not null default '',
  registration_label  text not null,
  registration_number text not null default '',
  address             text not null default '',
  -- Until this is 'recognised', receipts say the gift may not be deductible.
  tax_status          text not null default 'not_recognised'
                      check (tax_status in ('not_recognised', 'recognised')),
  -- Shown on receipts once recognised, e.g. the 501(c)(3) wording.
  tax_statement       text not null default '',
  -- For a church: "other than intangible religious benefits".
  religious_benefits  boolean not null default false,
  updated_by          uuid references users(id),
  updated_at          timestamptz not null default now()
);

insert into giving_entities (currency, registration_label)
values ('usd', 'EIN'), ('ngn', 'CAC registration number');

-- Every gift gets a receipt number, in order. Existing gifts are numbered too.
create sequence donation_receipt_seq start 1001;
alter table donations
  add column receipt_no bigint not null default nextval('donation_receipt_seq') unique;

-- One yearly statement per address, year, and currency.
create table giving_statements_sent (
  -- Emailed links name this id, never the address.
  id        uuid not null unique default gen_random_uuid(),
  email     text not null,
  year      integer not null,
  currency  text not null,
  livemode  boolean not null,
  sent_at   timestamptz not null default now(),
  primary key (email, year, currency, livemode)
);
