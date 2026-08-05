-- Shop Billing — GST-compliant SaaS schema (v2)
-- Run this whole file in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
--
-- This REPLACES the v1 schema (adds GSTIN/state/HSN fields, the purchase/
-- vendor side, invoice numbering, and CGST/SGST/IGST splits). If you already
-- ran v1 with real data in it, back it up first — this uses `create table if
-- not exists` + `alter table ... add column if not exists` so it's safe to
-- run again on top of v1, but nothing here migrates old single gst_amount
-- values into the new cgst/sgst/igst columns.

create extension if not exists "uuid-ossp";

-- ─── Shop profile (the "tenant") ────────────────────────────────────────
create table if not exists shops (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  legal_name text,
  gstin text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  state_code text, -- 2-digit GST state code; drives CGST+SGST vs IGST
  pincode text,
  gst_scheme text not null default 'regular' check (gst_scheme in ('regular', 'composition')),
  invoice_prefix text not null default 'INV',
  logo_url text,
  upi_id text,
  created_at timestamptz not null default now()
);
alter table shops add column if not exists legal_name text;
alter table shops add column if not exists gstin text;
alter table shops add column if not exists address_line1 text;
alter table shops add column if not exists address_line2 text;
alter table shops add column if not exists city text;
alter table shops add column if not exists state text;
alter table shops add column if not exists state_code text;
alter table shops add column if not exists pincode text;
alter table shops add column if not exists gst_scheme text not null default 'regular';
alter table shops add column if not exists invoice_prefix text not null default 'INV';
alter table shops add column if not exists logo_url text;
alter table shops add column if not exists upi_id text;

create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

-- ─── Catalog ─────────────────────────────────────────────────────────────
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  hsn_code text,
  unit text not null default 'NOS', -- NOS, KG, LTR, MTR, BOX, PCS, ...
  track_inventory boolean not null default false, -- opt-in per product; off = unlimited/not tracked
  stock_quantity numeric(12, 3) not null default 0,
  low_stock_threshold numeric(12, 2) not null default 0,
  barcode text,
  price numeric(12, 2) not null default 0,
  gst_percent numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);
alter table products add column if not exists hsn_code text;
alter table products add column if not exists unit text not null default 'NOS';
alter table products add column if not exists track_inventory boolean not null default false;
alter table products add column if not exists stock_quantity numeric(12, 3) not null default 0;
-- Widen existing quantity columns from 2 to 3 decimal places — needed for
-- items sold in small fractional amounts (e.g. 1 gram of saffron = 0.001kg).
-- Safe to run even if already 3dp, and safe on tables with existing data
-- (widening precision never loses data).
alter table products alter column stock_quantity type numeric(12, 3);
alter table products add column if not exists low_stock_threshold numeric(12, 2) not null default 0;
alter table products add column if not exists barcode text;
create unique index if not exists idx_products_barcode on products(shop_id, barcode) where barcode is not null;

-- ─── Sales side (output GST — GST you charge / "giving") ────────────────
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text not null,
  gstin text, -- present = B2B, null = B2C, drives GSTR-1 classification
  address text,
  state text,
  state_code text,
  created_at timestamptz not null default now()
);
alter table customers add column if not exists gstin text;
alter table customers add column if not exists address text;
alter table customers add column if not exists state text;
alter table customers add column if not exists state_code text;

-- Atomically-issued sequential invoice numbers, scoped per shop + Indian
-- financial year (Apr–Mar) — GST requires a consecutive, gap-free series.
create table if not exists invoice_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  next_number integer not null default 1,
  primary key (shop_id, financial_year)
);

create or replace function next_invoice_number(p_shop_id uuid, p_financial_year text)
returns integer
language sql
as $$
  insert into invoice_counters (shop_id, financial_year, next_number)
  values (p_shop_id, p_financial_year, 2)
  on conflict (shop_id, financial_year)
  do update set next_number = invoice_counters.next_number + 1
  returning next_number - 1;
$$;

create table if not exists bills (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null, -- null = walk-in
  staff_id uuid not null references staff(id),
  invoice_number text not null,
  financial_year text not null,
  subtotal numeric(12, 2) not null default 0,
  discount_type text not null default 'flat' check (discount_type in ('percent', 'flat')),
  discount_value numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  supply_type text not null default 'intra' check (supply_type in ('intra', 'inter')),
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  gst_amount numeric(12, 2) not null default 0, -- cgst+sgst+igst, kept for quick totals
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  status text not null default 'active' check (status in ('active', 'voided')),
  voided_at timestamptz,
  voided_by uuid references staff(id),
  void_reason text,
  total numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  credit_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, invoice_number)
);
alter table bills add column if not exists invoice_number text;
alter table bills add column if not exists financial_year text;
alter table bills add column if not exists taxable_amount numeric(12,2) not null default 0;
alter table bills add column if not exists supply_type text not null default 'intra';
alter table bills add column if not exists cgst_amount numeric(12,2) not null default 0;
alter table bills add column if not exists sgst_amount numeric(12,2) not null default 0;
alter table bills add column if not exists igst_amount numeric(12,2) not null default 0;
alter table bills add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other'));
alter table bills add column if not exists status text not null default 'active' check (status in ('active', 'voided'));
alter table bills add column if not exists voided_at timestamptz;
alter table bills add column if not exists voided_by uuid references staff(id);
alter table bills add column if not exists void_reason text;

create table if not exists bill_items (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid not null references bills(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  hsn_code text,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_gst numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null
);
alter table bill_items add column if not exists hsn_code text;
alter table bill_items add column if not exists cgst_amount numeric(12,2) not null default 0;
alter table bill_items add column if not exists sgst_amount numeric(12,2) not null default 0;
alter table bill_items add column if not exists igst_amount numeric(12,2) not null default 0;
alter table bill_items alter column quantity type numeric(12, 3);

-- Payments RECEIVED from customers against outstanding credit (receivables).
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  staff_id uuid not null references staff(id),
  amount numeric(12, 2) not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  note text,
  created_at timestamptz not null default now()
);
alter table payments add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other'));

-- ─── Festival notes ("what worked last time, what to remember") ─────────
-- The shop's own memory/plan per festival — immediately personal from day
-- one, unlike sales-trend analysis which needs a year of history to say
-- anything. Keyed by a stable slug (see lib/festivals.ts), not the exact
-- date, so a note carries over correctly even though festival dates shift
-- year to year on the lunar calendar.
create table if not exists festival_notes (
  shop_id uuid not null references shops(id) on delete cascade,
  festival_slug text not null,
  note text not null default '',
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  primary key (shop_id, festival_slug)
);
alter table festival_notes enable row level security;

-- ─── Item requests ("customer asked, we didn't have it") ────────────────
-- Not tied to the catalog — the item may not exist as a product yet.
-- customer_id is optional: link an existing customer, or just capture a
-- name/phone for someone not yet in the customer list.
create table if not exists item_requests (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  staff_id uuid not null references staff(id),
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  item_description text not null,
  advance_amount numeric(12, 2) not null default 0,
  expected_date date,
  status text not null default 'pending' check (status in ('pending', 'available', 'fulfilled', 'cancelled')),
  notes text,
  notified_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_item_requests_shop on item_requests(shop_id, status);
alter table item_requests enable row level security;

-- ─── Purchase side (input GST / ITC — GST you pay / "taking") ───────────
create table if not exists vendors (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text,
  gstin text,
  address text,
  state text,
  state_code text,
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete restrict,
  staff_id uuid not null references staff(id),
  vendor_invoice_number text not null, -- the vendor's own invoice number, not ours
  purchase_date date not null default current_date,
  subtotal numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  supply_type text not null default 'intra' check (supply_type in ('intra', 'inter')),
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  gst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  payable_amount numeric(12, 2) not null default 0,
  itc_eligible boolean not null default true,
  reverse_charge boolean not null default false,
  created_at timestamptz not null default now()
);
alter table purchases add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other'));

create table if not exists purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null, -- product name snapshot, or free-text item
  hsn_code text,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_gst numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null
);
alter table purchase_items alter column quantity type numeric(12, 3);

-- Payments WE make to vendors against payables.
create table if not exists purchase_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  staff_id uuid not null references staff(id),
  amount numeric(12, 2) not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  note text,
  created_at timestamptz not null default now()
);
alter table purchase_payments add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other'));

create index if not exists idx_products_shop on products(shop_id);
create index if not exists idx_customers_shop on customers(shop_id);
create index if not exists idx_vendors_shop on vendors(shop_id);
create index if not exists idx_bills_shop on bills(shop_id);
create index if not exists idx_bills_customer on bills(customer_id);
create index if not exists idx_bills_fy on bills(shop_id, financial_year);
create index if not exists idx_bills_status on bills(shop_id, status);
create index if not exists idx_bill_items_bill on bill_items(bill_id);
create index if not exists idx_bill_items_hsn on bill_items(hsn_code);
create index if not exists idx_payments_customer on payments(customer_id);
create index if not exists idx_purchases_shop on purchases(shop_id);
create index if not exists idx_purchases_vendor on purchases(vendor_id);
create index if not exists idx_purchases_date on purchases(shop_id, purchase_date);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_purchase_payments_vendor on purchase_payments(vendor_id);

-- RLS: enabled as a safety net. All real access goes through the server-side
-- service-role client, which bypasses RLS and enforces shop_id scoping in
-- application code (see lib/auth.ts). No public/anon policies are defined,
-- so the anon key alone cannot read or write these tables.
alter table shops enable row level security;
alter table staff enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table invoice_counters enable row level security;
alter table bills enable row level security;
alter table bill_items enable row level security;
alter table payments enable row level security;
alter table vendors enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table purchase_payments enable row level security;

NOTIFY pgrst, 'reload schema';

-- Public storage bucket for shop logos. Public read (logos need to display
-- on invoices/print pages without auth), writes only via the service-role
-- client from server actions — never directly from the browser.
insert into storage.buckets (id, name, public)
values ('shop-logos', 'shop-logos', true)
on conflict (id) do nothing;

-- ─── Platform / Super Admin layer ─────────────────────────────────────────
-- Entirely separate from shop staff — a super admin is just any auth.users
-- row whose id is whitelisted here. There's no self-signup for this; add
-- rows manually via SQL after creating the auth user (see DEPLOYMENT.md).
create table if not exists super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table super_admins enable row level security;

-- NULL = unlimited (default for all existing shops, so this rolls out
-- without locking anyone out) — a super admin sets an actual date once a
-- shop is on a paid plan.
alter table shops add column if not exists subscription_valid_until date;
alter table shops add column if not exists wallet_balance numeric(12, 2) not null default 0;

-- Audit trail of every recharge/validity change — who did it, when, and why.
create table if not exists subscription_transactions (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  new_valid_until date,
  note text,
  created_by uuid references super_admins(user_id),
  created_at timestamptz not null default now()
);
alter table subscription_transactions enable row level security;
create index if not exists idx_subscription_transactions_shop on subscription_transactions(shop_id);

-- ─── Rentals ───────────────────────────────────────────────────────────
-- Rental support is per-product opt-in — the same catalog serves both
-- sale (existing price/stock_quantity) and rental (these new fields),
-- since this shop sells some things and rents others.
alter table products add column if not exists is_rentable boolean not null default false;
alter table products add column if not exists rental_rate_hourly numeric(12, 2);
alter table products add column if not exists rental_rate_daily numeric(12, 2);
alter table products add column if not exists rental_rate_weekly numeric(12, 2);
alter table products add column if not exists rental_rate_monthly numeric(12, 2);
alter table products add column if not exists security_deposit numeric(12, 2) not null default 0;

-- Separate sequential numbering from sales invoices — a rental agreement
-- number, not a GST sales invoice number.
create table if not exists rental_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table rental_counters enable row level security;

create or replace function next_rental_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into rental_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = rental_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists rentals (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id),
  staff_id uuid not null references staff(id),
  rental_number text not null,
  financial_year text not null,
  status text not null default 'booked' check (status in ('booked', 'active', 'returned', 'cancelled')),
  start_date timestamptz not null,
  end_date timestamptz not null,
  actual_return_date timestamptz,
  supply_type text not null default 'intra' check (supply_type in ('intra', 'inter')),
  subtotal numeric(12, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  delivery_required boolean not null default false,
  delivery_address text,
  delivery_charge numeric(12, 2) not null default 0,
  security_deposit_collected numeric(12, 2) not null default 0,
  security_deposit_returned numeric(12, 2) not null default 0,
  damage_charge numeric(12, 2) not null default 0,
  late_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  paid_amount numeric(12, 2) not null default 0,
  credit_amount numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table rentals enable row level security;
create index if not exists idx_rentals_shop on rentals(shop_id);
create index if not exists idx_rentals_dates on rentals(shop_id, start_date, end_date);
create index if not exists idx_rentals_status on rentals(shop_id, status);

create table if not exists rental_items (
  id uuid primary key default uuid_generate_v4(),
  rental_id uuid not null references rentals(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  quantity numeric(12, 3) not null,
  rate_type text not null check (rate_type in ('hourly', 'daily', 'weekly', 'monthly')),
  rate numeric(12, 2) not null,
  duration numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null,
  deposit_per_unit numeric(12, 2) not null default 0,
  condition_on_return text check (condition_on_return in ('good', 'damaged', 'missing')),
  damage_notes text
);
alter table rental_items enable row level security;
create index if not exists idx_rental_items_rental on rental_items(rental_id);
create index if not exists idx_rental_items_product on rental_items(product_id);

-- ─── Business type (per-shop terminology/personalization) ────────────────
-- Same core engine for every shop — this just drives what words the UI
-- uses ("Products" vs "Menu items" vs "Medicines") and, over time, which
-- optional modules (like Rentals) get suggested. It does NOT gate access
-- to any feature — a grocery shop that also rents things still has full
-- access to Rentals regardless of this value.
alter table shops add column if not exists business_type text not null default 'general'
  check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'general'));

-- ─── Restaurant module ────────────────────────────────────────────────────
-- Manager PIN — separate from the owner's login password, used only for
-- supervisor-override actions (cancelling a started order). Never sent to
-- the client for comparison — checked server-side only.
alter table shops add column if not exists manager_pin text;

create table if not exists restaurant_tables (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  status text not null default 'free' check (status in ('free', 'occupied')),
  created_at timestamptz not null default now()
);
alter table restaurant_tables enable row level security;
create index if not exists idx_restaurant_tables_shop on restaurant_tables(shop_id);

create table if not exists restaurant_order_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table restaurant_order_counters enable row level security;

create or replace function next_restaurant_order_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into restaurant_order_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = restaurant_order_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

-- An "order" is the open tab for a table — it reserves its number as soon
-- as the first item is added (so the KOT and the eventual final bill share
-- the same number), and only becomes a real GST-relevant record once
-- settled. Cancelled orders keep their number reserved, never reused —
-- same philosophy as voided bills.
create table if not exists restaurant_orders (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  table_id uuid not null references restaurant_tables(id),
  staff_id uuid not null references staff(id),
  customer_id uuid references customers(id),
  order_number text not null,
  financial_year text not null,
  status text not null default 'open' check (status in ('open', 'settled', 'cancelled')),
  supply_type text not null default 'intra' check (supply_type in ('intra', 'inter')),
  subtotal numeric(12, 2) not null default 0,
  discount_type text not null default 'flat' check (discount_type in ('flat', 'percent')),
  discount_value numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  credit_amount numeric(12, 2) not null default 0,
  settled_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now()
);
alter table restaurant_orders enable row level security;
create index if not exists idx_restaurant_orders_shop on restaurant_orders(shop_id);
create index if not exists idx_restaurant_orders_status on restaurant_orders(shop_id, status);
create index if not exists idx_restaurant_orders_table on restaurant_orders(table_id);
create index if not exists idx_restaurant_orders_created on restaurant_orders(shop_id, created_at);

create table if not exists restaurant_order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references restaurant_orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null,
  kot_printed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table restaurant_order_items enable row level security;
create index if not exists idx_restaurant_order_items_order on restaurant_order_items(order_id);

-- Split settlement — a table can be paid part-cash, part-card/UPI, etc.
create table if not exists restaurant_order_payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references restaurant_orders(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);
alter table restaurant_order_payments enable row level security;
create index if not exists idx_restaurant_order_payments_order on restaurant_order_payments(order_id);

-- ─── Pharmacy module ───────────────────────────────────────────────────────
alter table products add column if not exists is_pharma boolean not null default false;
alter table products add column if not exists requires_prescription boolean not null default false;
alter table products add column if not exists salt_composition text;

-- A medicine can have several batches in stock at once, each with its own
-- expiry — billing always draws from the earliest-expiring batch first
-- (FEFO), and this table is what makes expiry alerts possible at all.
create table if not exists medicine_batches (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_number text not null,
  manufacturer text,
  mfg_date date,
  expiry_date date not null,
  quantity numeric(12, 3) not null default 0,
  purchase_price numeric(12, 2),
  created_at timestamptz not null default now()
);
alter table medicine_batches enable row level security;
create index if not exists idx_medicine_batches_shop on medicine_batches(shop_id);
create index if not exists idx_medicine_batches_product on medicine_batches(product_id);
create index if not exists idx_medicine_batches_expiry on medicine_batches(shop_id, expiry_date);

-- Prescription context applies to the whole bill (one visit, one
-- prescription, several medicines) rather than per line item.
alter table bills add column if not exists doctor_name text;
alter table bills add column if not exists patient_name text;

-- Which batch a sale actually drew stock from — needed for FEFO to mean
-- anything beyond "trust me."
alter table bill_items add column if not exists batch_id uuid references medicine_batches(id);

-- ─── Pharmacy enhancements ─────────────────────────────────────────────────
alter table products add column if not exists rack_location text;
alter table products add column if not exists drug_schedule text
  check (drug_schedule is null or drug_schedule in ('otc', 'h', 'h1', 'x', 'g'));
-- e.g. a strip of 10 tablets: units_per_pack=10, loose_unit_name='tablet' —
-- lets billing sell individual tablets instead of forcing a whole strip.
alter table products add column if not exists units_per_pack numeric(12, 3);
alter table products add column if not exists loose_unit_name text;

-- ─── Restaurant order type (PetPooja-style classification) ───────────────
alter table restaurant_orders add column if not exists order_type text not null default 'dine_in'
  check (order_type in ('dine_in', 'takeaway', 'delivery'));

-- ─── Business type lock ────────────────────────────────────────────────────
-- New shops lock their business type at signup (a real shop shouldn't be
-- able to casually flip between Restaurant/Pharmacy/etc. from Settings —
-- that's how test data from different verticals ends up mixed together in
-- the same shop). Existing shops stay unlocked so this doesn't retroactively
-- block anyone already using the app; only a super admin can change a
-- locked shop's type, from the platform admin panel.
alter table shops add column if not exists business_type_locked boolean not null default false;

-- ─── Waiter assignment ─────────────────────────────────────────────────────
-- Free-text rather than a strict staff reference — a floor waiter serving
-- tables doesn't need their own login just to be tagged on an order.
alter table restaurant_orders add column if not exists waiter_name text;

-- ─── Returns / Exchange (partial bill returns) ────────────────────────────
-- A return is its own clean record referencing the original bill — never
-- edits the original bill's numbers (which stays the accurate historical
-- record of what was actually invoiced). Kept as a separate credit-note-
-- style transaction with its own sequential number.
create table if not exists return_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table return_counters enable row level security;

create or replace function next_return_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into return_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = return_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists returns (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  bill_id uuid not null references bills(id),
  customer_id uuid references customers(id),
  staff_id uuid not null references staff(id),
  return_number text not null,
  financial_year text not null,
  reason text,
  subtotal numeric(12, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  refund_method text not null default 'cash' check (refund_method in ('cash', 'card', 'upi', 'online', 'other', 'credit_adjustment')),
  created_at timestamptz not null default now()
);
alter table returns enable row level security;
create index if not exists idx_returns_shop on returns(shop_id);
create index if not exists idx_returns_bill on returns(bill_id);

create table if not exists return_items (
  id uuid primary key default uuid_generate_v4(),
  return_id uuid not null references returns(id) on delete cascade,
  bill_item_id uuid not null references bill_items(id),
  product_id uuid references products(id),
  product_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null
);
alter table return_items enable row level security;
create index if not exists idx_return_items_return on return_items(return_id);
create index if not exists idx_return_items_bill_item on return_items(bill_item_id);

-- ─── Stock audit / physical count reconciliation ──────────────────────────
create table if not exists stock_audits (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  staff_id uuid not null references staff(id),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table stock_audits enable row level security;
create index if not exists idx_stock_audits_shop on stock_audits(shop_id);

create table if not exists stock_audit_items (
  id uuid primary key default uuid_generate_v4(),
  audit_id uuid not null references stock_audits(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  unit text not null default 'NOS',
  system_quantity numeric(12, 3) not null,
  counted_quantity numeric(12, 3),
  created_at timestamptz not null default now()
);
alter table stock_audit_items enable row level security;
create index if not exists idx_stock_audit_items_audit on stock_audit_items(audit_id);

-- ─── Kitchen workflow: pending → ready → served ───────────────────────────
alter table restaurant_order_items add column if not exists status text not null default 'pending'
  check (status in ('pending', 'ready', 'served'));

-- ─── Manager role ───────────────────────────────────────────────────────
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('owner', 'manager', 'staff'));

-- ─── Batch write-off (expired/damaged stock loss tracking) ───────────────
create table if not exists batch_writeoffs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  batch_id uuid not null references medicine_batches(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  batch_number text not null,
  staff_id uuid not null references staff(id),
  quantity numeric(12, 3) not null,
  reason text not null check (reason in ('expired', 'damaged', 'other')),
  notes text,
  created_at timestamptz not null default now()
);
alter table batch_writeoffs enable row level security;
create index if not exists idx_batch_writeoffs_shop on batch_writeoffs(shop_id);
create index if not exists idx_batch_writeoffs_product on batch_writeoffs(product_id);

-- ─── Combo / meal deals ─────────────────────────────────────────────────
create table if not exists combos (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table combos enable row level security;
create index if not exists idx_combos_shop on combos(shop_id);

create table if not exists combo_items (
  id uuid primary key default uuid_generate_v4(),
  combo_id uuid not null references combos(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  quantity numeric(12, 3) not null default 1
);
alter table combo_items enable row level security;
create index if not exists idx_combo_items_combo on combo_items(combo_id);

-- ─── QR table ordering (customer self-order, staff-approved) ─────────────
-- A separate random token (not the table's real id) is what goes into the
-- public QR URL — this keeps table ids unguessable and lets the token be
-- rotated independently if a QR sticker is ever compromised.
alter table restaurant_tables add column if not exists qr_token uuid not null default uuid_generate_v4();
create unique index if not exists idx_restaurant_tables_qr_token on restaurant_tables(qr_token);

-- A customer's scan never writes directly into the real order — it only
-- creates a request that staff must review and accept. This is the one
-- part of the whole app reachable without any login, so everything here
-- stays strictly read-the-menu / propose-items, nothing else.
create table if not exists table_order_requests (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  table_id uuid not null references restaurant_tables(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  customer_name text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table table_order_requests enable row level security;
create index if not exists idx_table_order_requests_table on table_order_requests(table_id);
create index if not exists idx_table_order_requests_shop_status on table_order_requests(shop_id, status);

create table if not exists table_order_request_items (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references table_order_requests(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null
);
alter table table_order_request_items enable row level security;
create index if not exists idx_table_order_request_items_request on table_order_request_items(request_id);
