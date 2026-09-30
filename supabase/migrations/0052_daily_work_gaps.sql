-- Day-to-day work the app didn't cover yet, across trades (from the gap list).
--
-- A. Udhaar limit per customer — the bill warns when a sale would take them past it.
-- B. Clinic: free follow-up — a repeat consultation within N days of a paid one is charged ₹0.
-- C. Repairs: the customer approves or declines the estimate from a WhatsApp link.
-- D. Lab: a home collection charge on the bill.
-- E. Rentals: photos of the item going out and coming back, and the customer's ID.
-- F. Jewellery: gold given to the karigar and the jewellery received back (weight, wastage).
-- G. Weighing-scale barcodes: a label printed by the scale carries the item and its weight or price.
-- H. "Buy X get Y free" on an item.
-- I. Delivery challan: goods go first, the bill follows (one challan or several into one bill).

-- A ─────────────────────────────────────────────────────────────────────
alter table customers add column if not exists credit_limit numeric(12, 2);

-- B ─────────────────────────────────────────────────────────────────────
alter table prescription_settings add column if not exists free_followup_days integer;
alter table prescription_settings add column if not exists consultation_product_ids uuid[] not null default '{}';

-- C ─────────────────────────────────────────────────────────────────────
alter table service_jobs add column if not exists estimate_status text;
alter table service_jobs drop constraint if exists service_jobs_estimate_status_check;
alter table service_jobs add constraint service_jobs_estimate_status_check check (estimate_status is null or estimate_status in ('sent', 'approved', 'declined'));
alter table service_jobs add column if not exists estimate_responded_at timestamptz;
alter table service_jobs add column if not exists estimate_note text;

-- D ─────────────────────────────────────────────────────────────────────
alter table shops add column if not exists lab_home_collection_charge numeric(10, 2) not null default 0;
alter table lab_orders add column if not exists collection_charge numeric(10, 2) not null default 0;

-- E ─────────────────────────────────────────────────────────────────────
-- [{ url, stage: 'out' | 'in' | 'id', at }]
alter table rentals add column if not exists photos jsonb not null default '[]'::jsonb;

-- F ─────────────────────────────────────────────────────────────────────
create table if not exists karigar_jobs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  karigar_name text not null,
  karigar_phone text,
  item_description text not null,
  metal_type text not null default 'gold' check (metal_type in ('gold', 'silver')),
  purity_percent numeric(5, 2) not null default 91.6,
  issued_weight numeric(10, 3) not null check (issued_weight > 0),
  issued_at timestamptz not null default now(),
  due_date date,
  wastage_allowed_percent numeric(5, 2) not null default 0,
  making_charge numeric(12, 2) not null default 0,
  received_weight numeric(10, 3),
  returned_metal_weight numeric(10, 3) not null default 0,
  received_at timestamptz,
  status text not null default 'with_karigar' check (status in ('with_karigar', 'received', 'cancelled')),
  notes text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_karigar_jobs_shop on karigar_jobs (shop_id, status);

-- G ─────────────────────────────────────────────────────────────────────
alter table shops add column if not exists scale_barcode_prefix text;
alter table shops add column if not exists scale_barcode_mode text not null default 'weight';
alter table shops drop constraint if exists shops_scale_barcode_mode_check;
alter table shops add constraint shops_scale_barcode_mode_check check (scale_barcode_mode in ('weight', 'price'));
alter table shops add column if not exists scale_code_digits integer not null default 5;

-- H ─────────────────────────────────────────────────────────────────────
alter table products add column if not exists bxgy_buy integer;
alter table products add column if not exists bxgy_free integer;
alter table products drop constraint if exists products_bxgy_check;
alter table products add constraint products_bxgy_check check ((bxgy_buy is null and bxgy_free is null) or (bxgy_buy is not null and bxgy_free is not null and bxgy_buy between 1 and 100 and bxgy_free between 1 and 100));

-- I ─────────────────────────────────────────────────────────────────────
create table if not exists challan_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table challan_counters enable row level security;

create or replace function next_challan_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into challan_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = challan_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;
revoke all on function next_challan_number(uuid, text) from public, anon, authenticated;
grant execute on function next_challan_number(uuid, text) to service_role;

create table if not exists delivery_challans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  challan_number text not null,
  challan_date date not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  site text,
  -- [{ productId, name, unit, quantity }] — goods and quantities; prices come at billing.
  items jsonb not null default '[]'::jsonb,
  vehicle text,
  received_by text,
  status text not null default 'open' check (status in ('open', 'billed', 'cancelled')),
  bill_id uuid references bills(id) on delete set null,
  stock_taken boolean not null default false,
  notes text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_delivery_challans_number on delivery_challans (shop_id, challan_number);
create index if not exists idx_delivery_challans_shop on delivery_challans (shop_id, status);

-- Read and written only by the server (service role).
alter table karigar_jobs enable row level security;
alter table delivery_challans enable row level security;
