-- Salon: stylist commission, service packages, and a customer's prepaid balance.
--
-- A. Commission. Each person on the payroll list can earn a percentage of the services they did
--    (and a usually smaller one on products they sold). Who did a line is the stylist picked for
--    that line, else the bill's stylist. The month's commission is added to their salary sheet.
--
-- B. Packages ("5 hair spa sessions for ₹3,999"). A package is a catalogue item that names the
--    service it covers, how many sessions and for how long. Selling it is an ordinary bill (GST
--    on the day it is sold); each visit after that takes one session at ₹0. Voiding the bill that
--    sold it cancels the package; voiding a visit's bill gives the session back.
--
-- C. Prepaid balance. A customer pays in advance (say ₹5,000, and the shop adds ₹500 more); bills
--    are then paid from the balance. Money paid in is an advance on the day ('advance_received'),
--    what a bill uses comes off that day's takings ('advance_applied'), and money handed back is
--    'refund_given' — so the Daily summary and closing the day still match the drawer.
--
-- D. Voiding a bill now also undoes what the bill used: a gold scheme goes back to running, and an
--    advance or prepaid balance used in it is given back. cash_movements gains the bill it was
--    used in, so the void can find it.

-- A ─────────────────────────────────────────────────────────────────────
alter table workers add column if not exists commission_service_percent numeric(5, 2) not null default 0;
alter table workers add column if not exists commission_product_percent numeric(5, 2) not null default 0;
alter table workers drop constraint if exists workers_commission_check;
alter table workers add constraint workers_commission_check
  check (commission_service_percent between 0 and 100 and commission_product_percent between 0 and 100);

-- The stylist who did this line, when it is not the bill's own stylist.
alter table bill_items add column if not exists provider_name text;

-- B ─────────────────────────────────────────────────────────────────────
alter table products add column if not exists package_service_id uuid references products(id) on delete set null;
alter table products add column if not exists package_sessions integer;
alter table products add column if not exists package_validity_days integer;
alter table products drop constraint if exists products_package_check;
alter table products add constraint products_package_check
  check ((package_sessions is null or package_sessions between 1 and 500) and (package_validity_days is null or package_validity_days between 1 and 3660));

create table if not exists customer_packages (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  plan_product_id uuid references products(id) on delete set null,
  name text not null,
  service_product_id uuid references products(id) on delete set null,
  service_name text not null,
  sessions_total integer not null check (sessions_total > 0),
  -- What one session is worth before GST (the package's price over its sessions): the base for the
  -- stylist's commission when a session is used.
  session_value numeric(12, 2) not null default 0,
  sold_bill_id uuid references bills(id) on delete set null,
  starts_on date not null,
  expires_on date,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_packages_customer on customer_packages (shop_id, customer_id);
create index if not exists idx_customer_packages_sold_bill on customer_packages (sold_bill_id);

create table if not exists package_uses (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  package_id uuid not null references customer_packages(id) on delete cascade,
  bill_id uuid references bills(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_package_uses_package on package_uses (package_id);
create index if not exists idx_package_uses_bill on package_uses (bill_id);

-- The package a ₹0 line was taken from.
alter table bill_items add column if not exists package_id uuid references customer_packages(id) on delete set null;

-- C ─────────────────────────────────────────────────────────────────────
create table if not exists wallet_entries (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  kind text not null check (kind in ('topup', 'spend', 'refund')),
  -- Money that changed hands: paid in (top-up) or handed back (refund); 0 for a bill paid from it.
  money numeric(12, 2) not null default 0 check (money >= 0),
  -- The change in the balance: + for a top-up (money plus any extra from the shop), − otherwise.
  credit numeric(12, 2) not null,
  bill_id uuid references bills(id) on delete cascade,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_wallet_entries_customer on wallet_entries (shop_id, customer_id);
create index if not exists idx_wallet_entries_bill on wallet_entries (bill_id);

-- Each customer's prepaid balance (only those with one).
create or replace function wallet_balances(p_shop_id uuid, p_customer_ids uuid[] default null)
returns table (customer_id uuid, balance numeric)
language sql
stable
as $$
  select w.customer_id, sum(w.credit) as balance
    from wallet_entries w
   where w.shop_id = p_shop_id
     and (p_customer_ids is null or w.customer_id = any (p_customer_ids))
   group by w.customer_id
  having sum(w.credit) <> 0
$$;
revoke all on function wallet_balances(uuid, uuid[]) from public, anon, authenticated;
grant execute on function wallet_balances(uuid, uuid[]) to service_role;

-- D ─────────────────────────────────────────────────────────────────────
alter table cash_movements drop constraint if exists cash_movements_source_check;
alter table cash_movements add constraint cash_movements_source_check
  check (source in ('service_job', 'reservation', 'rental', 'item_request', 'gold_scheme', 'wallet'));
alter table cash_movements add column if not exists bill_id uuid references bills(id) on delete cascade;
create index if not exists idx_cash_movements_bill on cash_movements (bill_id);

-- Read and written only by the server (service role), like every other money table.
alter table customer_packages enable row level security;
alter table package_uses enable row level security;
alter table wallet_entries enable row level security;
