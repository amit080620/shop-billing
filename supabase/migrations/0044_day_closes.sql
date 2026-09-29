-- Closing the day: the cash in the drawer, counted.
--
-- Every evening the counter counts the drawer. What should be there is the morning's opening
-- cash plus the day's cash change from the Daily summary; the count shows what is really there,
-- and the difference is a shortage or an excess to explain. Whatever is taken out (deposited in
-- the bank, taken home) leaves the rest in the drawer — which is tomorrow's opening cash.
-- One row per shop (and branch) per day.

create table if not exists day_closes (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  business_date date not null,
  opening_cash numeric(12, 2) not null default 0,
  cash_change numeric(12, 2) not null default 0,   -- the day's net cash (Daily summary) when closed
  expected_cash numeric(12, 2) not null,            -- opening + change
  counted_cash numeric(12, 2) not null,
  difference numeric(12, 2) not null,               -- counted − expected: + excess, − short
  cash_removed numeric(12, 2) not null default 0,   -- deposited in the bank / taken home
  carry_forward numeric(12, 2) not null,            -- left in the drawer: tomorrow's opening
  denominations jsonb,                              -- {"500": 4, "200": 3, ..., "coins": 37}
  note text,
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz not null default now()
);

create unique index if not exists uq_day_closes_day
  on day_closes (shop_id, business_date, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_day_closes_shop_date on day_closes (shop_id, business_date desc);

-- Read and written only by the server (service role), like every other money table.
alter table day_closes enable row level security;
