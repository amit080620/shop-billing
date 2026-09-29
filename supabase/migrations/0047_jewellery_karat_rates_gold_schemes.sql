-- Jewellery: a rate for each purity, and gold saving schemes.
--
-- A. Rates by purity. A jeweller quotes 24K, 22K and 18K gold at different rates; with one "gold"
--    rate an 18K ring was priced at the 22K rate. metal_rates now carries the purity each rate is
--    for ('24K', '22K', '18K', '14K'; '' for silver). Rates saved before this — no purity — are
--    read as 22K, the usual jewellery gold.
--
-- B. Gold saving schemes. The customer pays a fixed instalment every month (say ₹5,000 × 11); at
--    the end the jeweller adds a bonus (often one instalment) and the whole value is used to buy
--    jewellery. Each instalment is money in on the day it is paid (a cash_movements
--    'advance_received' row); when the scheme is redeemed in a bill its value comes off that
--    day's takings (an 'advance_applied' row), so nothing is counted twice. A scheme closed early
--    can hand the money back ('refund_given').

-- A ─────────────────────────────────────────────────────────────────────
alter table metal_rates add column if not exists purity text not null default '';
drop index if exists idx_metal_rates_shop_metal_date;
create unique index if not exists idx_metal_rates_shop_metal_purity_date on metal_rates (shop_id, metal_type, purity, effective_date);

-- B ─────────────────────────────────────────────────────────────────────
create table if not exists gold_scheme_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table gold_scheme_counters enable row level security;

create or replace function next_gold_scheme_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into gold_scheme_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = gold_scheme_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists gold_schemes (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  scheme_number text not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  installment_amount numeric(12, 2) not null check (installment_amount > 0),
  total_installments integer not null check (total_installments between 1 and 60),
  bonus_amount numeric(12, 2) not null default 0 check (bonus_amount >= 0),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'redeemed', 'closed')),
  redeemed_bill_id uuid references bills(id) on delete set null,
  redeemed_at timestamptz,
  closed_at timestamptz,
  refund_amount numeric(12, 2) not null default 0,
  notes text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_gold_schemes_number on gold_schemes (shop_id, scheme_number);
create index if not exists idx_gold_schemes_shop_status on gold_schemes (shop_id, status);

create table if not exists gold_scheme_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  scheme_id uuid not null references gold_schemes(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_gold_scheme_payments_scheme on gold_scheme_payments (scheme_id, created_at);

alter table gold_schemes enable row level security;
alter table gold_scheme_payments enable row level security;

-- Scheme instalments, their use in a bill and refunds move through the drawer like other advances.
alter table cash_movements drop constraint if exists cash_movements_source_check;
alter table cash_movements add constraint cash_movements_source_check
  check (source in ('service_job', 'reservation', 'rental', 'item_request', 'gold_scheme'));
