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
  -- true: product/menu prices are the FINAL amount the customer pays —
  -- GST is backed out of it, never added on top (e.g. a ₹100 Thali
  -- always bills at ₹100). false: prices are the pre-tax base and GST
  -- is added on top (e.g. ₹100 + 5% GST bills at ₹105). Shop owner's
  -- choice in Settings; there's no universally "correct" answer, both
  -- are legitimate ways different businesses price their menu/catalog.
  price_includes_gst boolean not null default true,
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
alter table shops add column if not exists price_includes_gst boolean not null default true;
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
  -- Captured from shops.price_includes_gst at creation time — records
  -- how THIS bill's prices were interpreted, independent of whatever
  -- the shop's setting is later, so returns/reports always reverse the
  -- calculation correctly for old bills too.
  price_includes_gst boolean not null default true,
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
  price_includes_gst boolean not null default true,
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
  -- I = Inside (dine-in, indoor), O = Outside (dine-in, outdoor), T = Take
  -- Away (no physical seating). Nullable so existing tables don't need a
  -- forced category; the UI treats unset as "Inside" by default.
  section text check (section in ('inside', 'outside', 'takeaway')),
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
  price_includes_gst boolean not null default true,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  credit_amount numeric(12, 2) not null default 0,
  settled_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  -- Order-lifecycle timestamps — previously only created_at/settled_at/
  -- cancelled_at existed, so screens showing "when was this ready?" or
  -- "when was this served?" had no real data to show. sent_to_kitchen_at
  -- is set at order creation (items appear on KDS immediately in this
  -- app's flow); first_ready_at/served_at are set the first time any
  -- item in the order reaches that status.
  sent_to_kitchen_at timestamptz,
  first_ready_at timestamptz,
  served_at timestamptz
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
  -- Chosen options travel with the order itself, not just the UI —
  -- shape: [{ group: "Beverage", choice: "Lassi", price: 0 }]. Stored
  -- denormalised (names + price captured at order time) so a later
  -- rename or price change to the menu never rewrites past orders.
  selected_modifiers jsonb not null default '[]'::jsonb,
  item_note text,
  created_at timestamptz not null default now()
);
alter table restaurant_order_items enable row level security;
create index if not exists idx_restaurant_order_items_order on restaurant_order_items(order_id);

-- Item options/modifiers — the owner defines these per product, e.g.
-- a Thali has a "Beverage" group with Lassi / Chaas choices.
create table if not exists product_option_groups (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  is_required boolean not null default true,
  is_multi_select boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table product_option_groups enable row level security;
create index if not exists idx_product_option_groups_product on product_option_groups(product_id);

create table if not exists product_option_choices (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references product_option_groups(id) on delete cascade,
  name text not null,
  -- 0 = included in the base price; > 0 = surcharge added to the line.
  extra_price numeric(12, 2) not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table product_option_choices enable row level security;
create index if not exists idx_product_option_choices_group on product_option_choices(group_id);

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

-- ─── Transport & Materials business type ──────────────────────────────────
create table if not exists vehicles (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  vehicle_number text,
  rate_per_km numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table vehicles enable row level security;
create index if not exists idx_vehicles_shop on vehicles(shop_id);

-- One "trip" — a vehicle covering some distance for a customer. Its
-- transport charge becomes one line on the same bill as the materials it
-- carried, so the customer gets a single combined invoice. bill_id is
-- filled in once billed; a trip can exist un-billed briefly while being
-- built up in the New Bill screen.
create table if not exists transport_trips (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  customer_id uuid references customers(id),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  trip_date date not null default current_date,
  km numeric(12, 2) not null,
  rate_per_km numeric(12, 2) not null,
  transport_charge numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table transport_trips enable row level security;
create index if not exists idx_transport_trips_shop on transport_trips(shop_id);
create index if not exists idx_transport_trips_vehicle on transport_trips(vehicle_id);
create index if not exists idx_transport_trips_bill on transport_trips(bill_id);

-- ─── Transport enhancements: driver + load weight ─────────────────────────
-- Free-text driver name — same reasoning as restaurant waiter_name, a
-- driver doesn't need their own login just to be tagged on a trip.
alter table transport_trips add column if not exists driver_name text;
alter table transport_trips add column if not exists load_weight numeric(12, 3);
alter table transport_trips add column if not exists load_unit text;

-- ─── Prevent duplicate pending QR order requests (race condition guard) ───
-- The application already checks "does a pending request exist?" before
-- inserting, but two near-simultaneous scans could both pass that check
-- before either insert lands. This partial unique index makes the
-- database itself the final word — a second pending insert for the same
-- table is rejected outright, closing the race window the app-level
-- check alone can't.
create unique index if not exists idx_table_order_requests_one_pending
  on table_order_requests(table_id)
  where status = 'pending';

-- ─── Prevent duplicate open orders on the same table (race condition) ────
-- Same reasoning as the QR request guard above — two waiters tapping the
-- same free table within the same instant could otherwise both pass the
-- "no open order yet" check before either insert lands.
create unique index if not exists idx_restaurant_orders_one_open_per_table
  on restaurant_orders(table_id)
  where status = 'open';

-- ─── Hardware/Electrical: warranty tracking ───────────────────────────────
-- Mirrors the pharma extension pattern (is_pharma/requires_prescription)
-- — an opt-in per product, since a hardware shop sells both warrantied
-- items (fans, geysers, MCBs) and plain hardware (nails, pipes) side by
-- side in the same catalog.
alter table products add column if not exists has_warranty boolean not null default false;
alter table products add column if not exists warranty_months integer;

-- Snapshotted onto the sale itself — if the product's warranty terms
-- change later, past sales keep the terms that were actually promised at
-- the time, same reasoning as bill_items.hsn_code being a snapshot.
alter table bill_items add column if not exists warranty_months integer;
alter table bill_items add column if not exists warranty_expires_on date;

-- ─── Grocery/Mart: MRP tracking ────────────────────────────────────────
-- Optional — only packaged/branded goods carry an MRP, loose items (rice,
-- dal from a sack) don't. Same snapshot pattern as warranty/HSN: the
-- bill_items copy is what was true at sale time, so a later MRP change
-- doesn't rewrite history.
alter table products add column if not exists mrp numeric(12, 2);
alter table bill_items add column if not exists mrp numeric(12, 2);

-- ─── Repair & Services business type (mobile repair, laundry, tailoring,
-- AC/appliance repair, watch repair — anything that runs on "item comes
-- in, work happens, item goes out") ────────────────────────────────────
create table if not exists job_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table job_counters enable row level security;

create or replace function next_job_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into job_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = job_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists service_jobs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  job_number text not null,
  financial_year text not null,
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  item_description text not null,
  issue_description text,
  status text not null default 'received' check (status in ('received', 'in_progress', 'ready', 'delivered', 'cancelled')),
  technician_name text,
  estimated_cost numeric(12, 2),
  final_cost numeric(12, 2),
  advance_paid numeric(12, 2) not null default 0,
  expected_date date,
  ready_at timestamptz,
  delivered_at timestamptz,
  bill_id uuid references bills(id) on delete set null,
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table service_jobs enable row level security;
create index if not exists idx_service_jobs_shop on service_jobs(shop_id);
create index if not exists idx_service_jobs_status on service_jobs(shop_id, status);
create index if not exists idx_service_jobs_customer on service_jobs(customer_id);

-- ─── Salon / Spa business type ────────────────────────────────────────────
-- Which stylist/staff performed the services on this bill — a salon
-- customer's single visit is usually one continuous service by one
-- person, so this lives at the bill level (same reasoning as Restaurant's
-- waiter_name on the order), not per line item.
alter table bills add column if not exists service_provider_name text;

-- ─── Jewellery business type ───────────────────────────────────────────────
-- Deliberately built as a calculator that produces one plain billed line
-- item (exactly like the Transport charge picker) rather than changing
-- how the cart/billing engine works — every other vertical's billing
-- stays untouched and just as reliable.
-- Gold/silver rate changes daily and applies uniformly to every item of
-- that metal — one rate per shop per metal per day, not per product.
create table if not exists metal_rates (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  metal_type text not null check (metal_type in ('gold', 'silver')),
  rate_per_gram numeric(12, 2) not null,
  effective_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table metal_rates enable row level security;
create unique index if not exists idx_metal_rates_shop_metal_date on metal_rates(shop_id, metal_type, effective_date);

-- Per-item jewellery attributes — all optional, only meaningful when the
-- item is actually priced by weight.
alter table products add column if not exists metal_type text check (metal_type in ('gold', 'silver'));
alter table products add column if not exists purity text;
alter table products add column if not exists making_charge_type text check (making_charge_type in ('per_gram', 'flat', 'percent'));
alter table products add column if not exists making_charge_value numeric(12, 2);
alter table products add column if not exists wastage_percent numeric(5, 2);

-- ─── Jewellery: old gold/silver exchange ──────────────────────────────────
-- Exchange value is treated as a payment method, not a discount — it's
-- money-equivalent handed over at the counter, same as cash, so it adds
-- straight into paid_amount on the bill rather than touching the taxable
-- value or discount fields (which stay tied to the actual sale price of
-- the new item). This table is purely the shop's own record of what
-- old material came in, for their own melting/refining bookkeeping.
create table if not exists jewellery_exchanges (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  bill_id uuid references bills(id) on delete set null,
  metal_type text not null check (metal_type in ('gold', 'silver')),
  description text,
  gross_weight numeric(10, 3) not null,
  purity_percent numeric(5, 2) not null,
  net_weight numeric(10, 3) not null,
  rate_per_gram numeric(12, 2) not null,
  exchange_value numeric(12, 2) not null,
  customer_id uuid references customers(id),
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table jewellery_exchanges enable row level security;
create index if not exists idx_jewellery_exchanges_shop on jewellery_exchanges(shop_id);
create index if not exists idx_jewellery_exchanges_bill on jewellery_exchanges(bill_id);

-- ─── Salon: appointment booking ────────────────────────────────────────────
create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  service_name text not null,
  stylist_name text,
  appointment_date date not null,
  appointment_time text not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show')),
  notes text,
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table appointments enable row level security;
create index if not exists idx_appointments_shop_date on appointments(shop_id, appointment_date);
create index if not exists idx_appointments_customer on appointments(customer_id);

-- ─── Bulk/wholesale pricing tier ───────────────────────────────────────────
-- One simple tier per product (e.g. "10+ units at ₹45 instead of ₹50") —
-- covers the common Indian retail/hardware/grocery pattern without
-- needing a full multi-tier pricing engine. Applied automatically in
-- New Bill based on the quantity in the cart.
alter table products add column if not exists bulk_min_qty numeric(12, 3);
alter table products add column if not exists bulk_price numeric(12, 2);

-- ─── Jewellery: hallmark/BIS number ────────────────────────────────────────
alter table products add column if not exists hallmark_number text;
alter table bill_items add column if not exists hallmark_number text;

-- ─── Transport: vehicle document expiry tracking ──────────────────────────
alter table vehicles add column if not exists rc_expiry date;
alter table vehicles add column if not exists insurance_expiry date;
alter table vehicles add column if not exists puc_expiry date;
alter table vehicles add column if not exists fitness_expiry date;

-- ─── Repair & Services: itemized job contents ─────────────────────────────
-- A single job (e.g. one laundry drop-off) can contain several distinct
-- items (5 shirts, 2 pants) — service_jobs.item_description stays as the
-- short summary shown everywhere else (job list, KDS-style cards, the
-- bill line item), while this table holds the actual itemized list so
-- nothing gets lost or miscounted at pickup.
create table if not exists service_job_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references service_jobs(id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null default 1,
  notes text,
  created_at timestamptz not null default now()
);
alter table service_job_items enable row level security;
create index if not exists idx_service_job_items_job on service_job_items(job_id);

-- ─── Restaurant: table reservations ────────────────────────────────────────
create table if not exists restaurant_reservations (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  party_size integer not null default 2,
  reservation_date date not null,
  reservation_time text not null,
  table_preference text,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'seated', 'cancelled', 'no_show')),
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table restaurant_reservations enable row level security;
create index if not exists idx_restaurant_reservations_shop_date on restaurant_reservations(shop_id, reservation_date);

-- ─── Clinic / Doctor business type ─────────────────────────────────────────
alter table shops drop constraint if exists shops_business_type_check;
alter table shops add constraint shops_business_type_check
  check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'transport', 'service', 'salon', 'jewellery', 'clinic', 'gym', 'lab', 'general'));

-- Patient-specific optional fields, added to the existing customers table
-- rather than a separate "patients" table — a clinic's patients ARE its
-- customers (same ledger, same repeat-visit history), just with a few
-- extra medical fields that stay null for every other business type.
alter table customers add column if not exists date_of_birth date;
alter table customers add column if not exists gender text check (gender in ('male', 'female', 'other'));
alter table customers add column if not exists blood_group text;
alter table customers add column if not exists known_allergies text;

-- The doctor's letterhead — set once, applied to every prescription
-- printed. Deliberately separate from the shop's logo/name (used on
-- bills) since a prescription pad conventionally carries the doctor's
-- own registration details, qualifications, and clinic timings, not a
-- generic shop header.
create table if not exists prescription_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  header_text text,
  footer_text text,
  show_shop_logo boolean not null default true,
  custom_field_labels jsonb not null default '["Chief Complaint", "Diagnosis", "Advice"]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table prescription_settings enable row level security;

create table if not exists clinic_appointments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  patient_id uuid references customers(id),
  patient_name text not null,
  patient_phone text not null,
  reason_for_visit text,
  appointment_date date not null,
  appointment_time text not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'arrived', 'in_consultation', 'completed', 'cancelled', 'no_show')),
  doctor_name text,
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table clinic_appointments enable row level security;
create index if not exists idx_clinic_appointments_shop_date on clinic_appointments(shop_id, appointment_date);

create table if not exists prescription_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table prescription_counters enable row level security;

create or replace function next_prescription_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into prescription_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = prescription_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

-- Custom sections (Chief Complaint, Diagnosis, Lab Tests, Vitals, Advice
-- — whatever the doctor's own pad uses) are stored as a flexible ordered
-- array rather than fixed columns, so there's genuinely no limit on what
-- a doctor can add without a schema change.
create table if not exists prescriptions (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  prescription_number text not null,
  financial_year text not null,
  appointment_id uuid references clinic_appointments(id) on delete set null,
  patient_id uuid references customers(id),
  patient_name text not null,
  patient_age text,
  patient_gender text,
  patient_phone text,
  doctor_name text,
  custom_sections jsonb not null default '[]'::jsonb,
  follow_up_date date,
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table prescriptions enable row level security;
create index if not exists idx_prescriptions_shop on prescriptions(shop_id);
create index if not exists idx_prescriptions_patient on prescriptions(patient_id);

create table if not exists prescription_items (
  id uuid primary key default uuid_generate_v4(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  medicine_name text not null,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  quantity numeric(10, 2),
  sort_order integer not null default 0
);
alter table prescription_items enable row level security;
create index if not exists idx_prescription_items_prescription on prescription_items(prescription_id);

-- ─── Public self-service booking (Clinic + Salon) ──────────────────────────
-- One shared system for both — a patient booking a doctor's slot and a
-- customer booking a haircut slot are the same underlying need: show
-- what's actually free, let them pick, done. Which table the resulting
-- booking lands in (clinic_appointments vs appointments) depends on the
-- shop's business_type, decided in the action, not the schema.
create table if not exists booking_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  slot_duration_minutes integer not null default 20,
  working_hours jsonb not null default '{}'::jsonb,
  is_public_booking_enabled boolean not null default false,
  public_token uuid not null default uuid_generate_v4(),
  updated_at timestamptz not null default now()
);
alter table booking_settings enable row level security;
create unique index if not exists idx_booking_settings_public_token on booking_settings(public_token);

-- ─── Public catalog / ordering link (all business types) ──────────────────
-- Same pattern as the QR table-ordering system built for Restaurant,
-- generalised: any shop can share one link where anyone can browse their
-- catalog (with photos/price/offers) and submit an order request — never
-- an instant sale, always reviewed by staff first, since there's no
-- online payment or live stock lock involved.

alter table products add column if not exists image_url text;
alter table products add column if not exists offer_price numeric(12, 2);
alter table products add column if not exists offer_label text;
alter table products add column if not exists show_in_catalog boolean not null default true;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create table if not exists catalog_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  is_enabled boolean not null default false,
  public_token uuid not null default uuid_generate_v4(),
  banner_text text,
  updated_at timestamptz not null default now()
);
alter table catalog_settings enable row level security;
create unique index if not exists idx_catalog_settings_public_token on catalog_settings(public_token);

create table if not exists catalog_order_requests (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  bill_id uuid references bills(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table catalog_order_requests enable row level security;
create index if not exists idx_catalog_order_requests_shop on catalog_order_requests(shop_id, status);

create table if not exists catalog_order_request_items (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references catalog_order_requests(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity numeric(10, 2) not null default 1,
  price_at_request numeric(12, 2) not null
);
alter table catalog_order_request_items enable row level security;
create index if not exists idx_catalog_order_request_items_request on catalog_order_request_items(request_id);

-- ─── Invoice design settings (all business types) ──────────────────────────
-- The shop's own branding on top of the fixed billing layout — a tagline,
-- footer message, optional terms & bank details, and an accent colour.
-- Deliberately NOT a drag-and-drop canvas editor: the actual GST-correct
-- invoice structure (line items, tax breakup, totals) is what every
-- report and reconciliation depends on, so it stays fixed — only the
-- branding elements around it are customisable. The same accent_color is
-- reused on prescriptions too, so one setting brands both documents.
create table if not exists invoice_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  tagline text,
  footer_text text,
  terms_and_conditions text,
  bank_details text,
  accent_color text not null default '#0f6b5c',
  updated_at timestamptz not null default now()
);
alter table invoice_settings enable row level security;

-- ─── Header/footer images (invoice + prescription) and doctor profile ─────
alter table invoice_settings add column if not exists header_image_url text;
alter table invoice_settings add column if not exists footer_image_url text;
alter table prescription_settings add column if not exists header_image_url text;
alter table prescription_settings add column if not exists footer_image_url text;

-- Doctor profile shown on the public booking link (name, photo,
-- qualifications) — separate from the letterhead text, since a clinic
-- with multiple doctors may want the booking page to clearly show which
-- doctor the patient is booking with.
alter table booking_settings add column if not exists doctor_name text;
alter table booking_settings add column if not exists doctor_qualifications text;
alter table booking_settings add column if not exists doctor_photo_url text;

-- Specific dates the doctor/salon is NOT available (leave, holiday) even
-- though it falls on a normally-working day per working_hours — an
-- ordinary array of ISO dates is enough; the public booking page filters
-- these out entirely rather than trying to compute partial-day exceptions.
alter table booking_settings add column if not exists unavailable_dates jsonb not null default '[]'::jsonb;

-- ─── Petty cash (all business types) ───────────────────────────────────────
-- Small day-to-day cash outflows (tea, stationery, auto fare, local
-- purchases) that never go through the Purchases/Vendor flow — every
-- shop needs somewhere to log these so "cash in hand" actually
-- reconciles at day's end.
create table if not exists petty_cash_entries (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table petty_cash_entries enable row level security;
create index if not exists idx_petty_cash_entries_shop_date on petty_cash_entries(shop_id, created_at);

-- ─── Granular staff permissions ────────────────────────────────────────────
-- Replaces the rigid owner/manager/staff role split for anything beyond
-- basic login — the owner ticks exactly what each staff member can do,
-- stored as a simple list of permission keys. role stays for the basic
-- "can this person log in as owner/manager/staff" distinction (owner
-- always implicitly has every permission); this column is what actually
-- gates sensitive actions now.
alter table staff add column if not exists permissions jsonb not null default '[]'::jsonb;

-- ─── Multi-branch support (within one shop account) ────────────────────────
-- Deliberately NOT separate logins per branch — staff.id is permanently
-- tied 1:1 to its auth user (a foundational assumption throughout the
-- app), so true "switch between independent shops" would mean rewriting
-- authentication itself. This instead tags bills and staff with a
-- branch under the SAME shop, so the owner gets real per-branch
-- visibility (who sold what, where) without that risk.
create table if not exists branches (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table branches enable row level security;
create index if not exists idx_branches_shop on branches(shop_id);

alter table staff add column if not exists branch_id uuid references branches(id) on delete set null;
alter table bills add column if not exists branch_id uuid references branches(id) on delete set null;

-- ─── Bill editing (owner/permission only) — audit trail ────────────────────
-- A genuine post-creation edit, distinct from Void — the invoice number
-- and created_at never change (keeps the GST invoice sequence intact),
-- but who edited it, when, and why is recorded so there's a clear trail
-- if a tax inspector or the owner ever asks "why does this differ from
-- what was printed originally".
alter table bills add column if not exists edited_at timestamptz;
alter table bills add column if not exists edited_by uuid references staff(id);
alter table bills add column if not exists edit_reason text;

-- ─── Gym / Fitness business type ────────────────────────────────────────────
-- Members ARE customers (same ledger/history pattern as Clinic patients),
-- with a few extra fitness-specific fields, plus assigned trainer (a
-- staff member).
alter table customers add column if not exists assigned_trainer_id uuid references staff(id) on delete set null;
alter table customers add column if not exists fitness_goal text;
alter table customers add column if not exists height_cm numeric(5, 1);
alter table customers add column if not exists weight_kg numeric(5, 1);

create table if not exists membership_plans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  duration_days integer not null,
  price numeric(12, 2) not null,
  pt_sessions_included integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table membership_plans enable row level security;
create index if not exists idx_membership_plans_shop on membership_plans(shop_id);

create table if not exists memberships (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  plan_id uuid references membership_plans(id) on delete set null,
  plan_name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'frozen', 'cancelled', 'expired')),
  pt_sessions_total integer not null default 0,
  pt_sessions_used integer not null default 0,
  bill_id uuid references bills(id) on delete set null,
  frozen_days_used integer not null default 0,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table memberships enable row level security;
create index if not exists idx_memberships_shop_member on memberships(shop_id, member_id);
create index if not exists idx_memberships_shop_status on memberships(shop_id, status, end_date);

create table if not exists gym_attendance (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz
);
alter table gym_attendance enable row level security;
create index if not exists idx_gym_attendance_shop_date on gym_attendance(shop_id, checked_in_at);
-- A member can only have one open (not-yet-checked-out) attendance row
-- at a time — prevents a double check-in from the same phone/kiosk
-- creating duplicate "currently in gym" rows.
create unique index if not exists idx_gym_attendance_one_open_per_member
  on gym_attendance(member_id) where checked_out_at is null;

-- ─── Rental edit — audit trail (mirrors bills) ─────────────────────────────
alter table rentals add column if not exists edited_at timestamptz;
alter table rentals add column if not exists edited_by uuid references staff(id);
alter table rentals add column if not exists edit_reason text;

-- ─── KDS: order revision tracking ──────────────────────────────────────────
-- Previously, removing an item already sent to the kitchen just silently
-- deleted the row — the KDS screen would lose it on the next poll with
-- no indication anything changed, even if the cook was already
-- preparing it. Now: an item already sent to kitchen (kot_printed=true)
-- gets marked 'cancelled' instead of deleted, so it stays visible
-- (struck through) until acknowledged, and the whole ticket flashes
-- "revised" so kitchen staff notice without having to compare orders
-- from memory.
alter table restaurant_order_items drop constraint if exists restaurant_order_items_status_check;
alter table restaurant_order_items add constraint restaurant_order_items_status_check
  check (status in ('pending', 'ready', 'served', 'cancelled'));

alter table restaurant_orders add column if not exists revised_at timestamptz;

-- ─── Reservation: real table blocking + token/refund ───────────────────────
-- table_preference was free text — didn't actually reserve a real table,
-- so nothing stopped a walk-in from being seated there anyway. Now a
-- reservation can be tied to an actual table (table_id), and that
-- table shows as reserved/blocked for that slot until the reservation
-- is seated, cancelled, or marked no-show.
alter table restaurant_reservations add column if not exists table_id uuid references restaurant_tables(id) on delete set null;
alter table restaurant_reservations add column if not exists token_amount numeric(12, 2) not null default 0;
alter table restaurant_reservations add column if not exists refund_amount numeric(12, 2) not null default 0;
alter table restaurant_reservations add column if not exists refund_type text check (refund_type in ('none', 'partial', 'full'));

-- Links a reservation's token straight through to the actual table
-- order, so when the guest is finally billed, whatever they already
-- paid as a token comes off the total automatically — no separate
-- manual step to remember.
alter table restaurant_orders add column if not exists reservation_id uuid references restaurant_reservations(id) on delete set null;

-- ─── Gym: Workout plans, Diet plans, Progress tracking ─────────────────────
create table if not exists workout_plans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  title text not null,
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table workout_plans enable row level security;
create index if not exists idx_workout_plans_shop_member on workout_plans(shop_id, member_id);

create table if not exists workout_exercises (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references workout_plans(id) on delete cascade,
  muscle_group text,
  exercise_name text not null,
  sets integer,
  reps text,
  rest_seconds integer,
  sort_order integer not null default 0
);
alter table workout_exercises enable row level security;
create index if not exists idx_workout_exercises_plan on workout_exercises(plan_id);

create table if not exists diet_plans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  goal text,
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table diet_plans enable row level security;
create index if not exists idx_diet_plans_shop_member on diet_plans(shop_id, member_id);

create table if not exists diet_meals (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references diet_plans(id) on delete cascade,
  meal_slot text not null check (meal_slot in ('breakfast', 'mid_morning', 'lunch', 'evening', 'dinner', 'post_workout')),
  food_items text not null,
  calories numeric(6, 1),
  sort_order integer not null default 0
);
alter table diet_meals enable row level security;
create index if not exists idx_diet_meals_plan on diet_meals(plan_id);

-- Simple progress log a trainer/member updates over time — weight is the
-- one number every gym actually tracks consistently; body-fat% is
-- optional since not every gym has the equipment to measure it.
create table if not exists progress_logs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  weight_kg numeric(5, 1),
  body_fat_percent numeric(4, 1),
  note text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table progress_logs enable row level security;
create index if not exists idx_progress_logs_shop_member on progress_logs(shop_id, member_id, created_at);

-- ─── Gym: simple lead tracker ───────────────────────────────────────────────
-- Deliberately a flat list with a status dropdown, not a full Kanban
-- pipeline — covers the real day-to-day need (who to follow up with)
-- without the larger drag-and-drop board/stage-automation build.
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text not null,
  source text,
  interested_plan text,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'converted', 'lost')),
  notes text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table leads enable row level security;
create index if not exists idx_leads_shop_status on leads(shop_id, status);

-- ─── Gym: simple class schedule (no live capacity/waitlist engine) ────────
-- A recurring weekly schedule (Yoga Mon/Wed/Fri 6am) plus a simple
-- attendee list per date — enough to plan and see who's coming, without
-- the real-time booking/waitlist/capacity-lock engine a large studio
-- chain would eventually need.
create table if not exists gym_classes (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  trainer_id uuid references staff(id) on delete set null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 60,
  capacity integer not null default 15,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table gym_classes enable row level security;
create index if not exists idx_gym_classes_shop on gym_classes(shop_id);

create table if not exists gym_class_bookings (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid not null references gym_classes(id) on delete cascade,
  member_id uuid not null references customers(id) on delete cascade,
  class_date date not null,
  created_at timestamptz not null default now(),
  unique (class_id, member_id, class_date)
);
alter table gym_class_bookings enable row level security;
create index if not exists idx_gym_class_bookings_class_date on gym_class_bookings(class_id, class_date);

-- ─── Gym: self-service check-in kiosk ──────────────────────────────────────
-- The real bottleneck the owner described: staff manually searching and
-- tapping "check in" for every single member is not scalable. This lets
-- a member check themselves in by typing their own phone number on a
-- tablet/phone left open at the entrance — no staff involvement per
-- member. Same public-link pattern as booking_settings/catalog_settings.
create table if not exists gym_kiosk_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  is_enabled boolean not null default false,
  public_token uuid unique not null default uuid_generate_v4(),
  updated_at timestamptz not null default now()
);
alter table gym_kiosk_settings enable row level security;

-- ─── Clinic: specialty-aware consultation (safe, structured data only) ────
-- Deliberately NO scoring/risk-calculation/diagnosis-suggestion logic —
-- that is clinical decision support and needs regulatory validation an
-- app like this cannot provide. What's built instead is structured DATA
-- CAPTURE that looks and feels specialty-specific: a real tooth chart
-- for Dental, a vitals panel for Cardiology/General/Physio — the doctor
-- still makes every clinical judgment themselves.
alter table prescription_settings add column if not exists specialty text not null default 'general'
  check (specialty in ('general', 'dental', 'cardiology', 'dermatology', 'physiotherapy', 'orthopedic', 'ent', 'gynecology', 'pediatric', 'psychiatry'));

-- Snapshot per prescription — {"11": "cavity", "22": "missing", ...} using
-- standard adult dental notation (11-18, 21-28, 31-38, 41-48).
alter table prescriptions add column if not exists dental_chart jsonb;

-- Plain structured vitals — every field optional, no derived/calculated
-- values stored.
alter table prescriptions add column if not exists vitals jsonb;

-- ─── Clinic: add Ophthalmology specialty, growth logs, patient photos ─────
alter table prescription_settings drop constraint if exists prescription_settings_specialty_check;
alter table prescription_settings add constraint prescription_settings_specialty_check
  check (specialty in ('general', 'dental', 'cardiology', 'dermatology', 'physiotherapy', 'orthopedic', 'ent', 'gynecology', 'pediatric', 'psychiatry', 'ophthalmology'));

-- Pediatric growth tracking — deliberately a plain trend over time, no
-- percentile/WHO-curve overlay and no "normal vs abnormal" flagging.
-- The doctor plots and interprets it themselves; this just saves them
-- re-measuring from old paper charts.
create table if not exists growth_logs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  patient_id uuid not null references customers(id) on delete cascade,
  height_cm numeric(5, 1),
  weight_kg numeric(5, 1),
  head_circumference_cm numeric(5, 1),
  note text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table growth_logs enable row level security;
create index if not exists idx_growth_logs_shop_patient on growth_logs(shop_id, patient_id, created_at);

-- Dermatology (or any specialty) before/after photo documentation.
insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', true)
on conflict (id) do nothing;

create table if not exists patient_photos (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  patient_id uuid not null references customers(id) on delete cascade,
  photo_url text not null,
  label text not null default 'before' check (label in ('before', 'after', 'other')),
  note text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table patient_photos enable row level security;
create index if not exists idx_patient_photos_shop_patient on patient_photos(shop_id, patient_id, created_at);

-- ─── Lab / Diagnostics business type ────────────────────────────────────────
-- Reference ranges shown alongside a result (Result | Range | Unit | H/L
-- flag) are standard lab-report practice — a simple arithmetic
-- comparison, exactly what every printed lab report already shows.
-- Deliberately NOT built: any "impression/interpretation" text, risk
-- score, or diagnosis suggestion — that is clinical decision-making the
-- lab technician/pathologist does, never this software.

create table if not exists lab_tests (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  category text,
  sample_type text not null default 'blood' check (sample_type in ('blood', 'urine', 'stool', 'swab', 'other')),
  price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  turnaround_hours integer not null default 24,
  reference_range text,
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table lab_tests enable row level security;
create index if not exists idx_lab_tests_shop on lab_tests(shop_id);

-- A package/profile bundles several tests under one price (e.g. "Full
-- Body Checkup"), same idea as a restaurant combo.
create table if not exists lab_packages (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table lab_packages enable row level security;

create table if not exists lab_package_tests (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid not null references lab_packages(id) on delete cascade,
  test_id uuid not null references lab_tests(id) on delete cascade
);
alter table lab_package_tests enable row level security;
create index if not exists idx_lab_package_tests_package on lab_package_tests(package_id);

-- One order = one patient visit/booking, can contain several individual
-- tests and/or packages.
create table if not exists lab_orders (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_number text not null,
  financial_year text not null,
  patient_id uuid references customers(id) on delete set null,
  patient_name text not null,
  patient_phone text not null,
  patient_age text,
  patient_gender text check (patient_gender in ('male', 'female', 'other')),
  referring_doctor_name text,
  collection_type text not null default 'walk_in' check (collection_type in ('walk_in', 'home_collection')),
  home_address text,
  collection_slot text,
  phlebotomist_id uuid references staff(id) on delete set null,
  status text not null default 'booked' check (status in ('booked', 'sample_collected', 'received_at_lab', 'processing', 'report_ready', 'delivered', 'cancelled')),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table lab_orders enable row level security;
create index if not exists idx_lab_orders_shop_status on lab_orders(shop_id, status);
create index if not exists idx_lab_orders_shop_patient on lab_orders(shop_id, patient_id);

create table if not exists lab_order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references lab_orders(id) on delete cascade,
  test_id uuid references lab_tests(id) on delete set null,
  test_name text not null,
  reference_range text,
  unit text,
  result_value text,
  result_flag text check (result_flag in ('normal', 'high', 'low', null)),
  price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0
);
alter table lab_order_items enable row level security;
create index if not exists idx_lab_order_items_order on lab_order_items(order_id);

create table if not exists lab_order_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table lab_order_counters enable row level security;

create or replace function next_lab_order_number(p_shop_id uuid, p_financial_year text)
returns integer language plpgsql as $$
declare
  v_number integer;
begin
  insert into lab_order_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = lab_order_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

-- ─── PHASE 1: Atomic stock decrement (fixes overselling race condition) ────
-- Previously: app code READ stock_quantity, computed new value, then
-- WROTE it back — two concurrent sales of the last unit could both read
-- the same starting value and both "succeed", silently overselling.
-- This does the read+subtract+write as ONE atomic UPDATE statement —
-- Postgres serializes concurrent UPDATEs to the same row automatically,
-- so the second call always sees the first call's already-decremented
-- value. Behavior is unchanged otherwise (never blocks a sale, clamps
-- at zero) — this only fixes the race, not the business rule.
create or replace function decrement_stock(p_product_id uuid, p_quantity numeric)
returns void language sql as $$
  update products
  set stock_quantity = greatest(0, stock_quantity - p_quantity)
  where id = p_product_id;
$$;

create or replace function increment_stock(p_product_id uuid, p_quantity numeric)
returns void language sql as $$
  update products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id;
$$;

-- ─── PHASE 1: Comprehensive audit log ───────────────────────────────────────
-- One central table for every sensitive action across the whole app —
-- previously this was scattered (edited_at/edited_by only on bills and
-- rentals, nothing for staff/permission changes, void reasons, etc.).
-- `details` is a free-form JSONB snapshot (old/new values, reason) so
-- new event types never need a schema change.
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table audit_logs enable row level security;
create index if not exists idx_audit_logs_shop_created on audit_logs(shop_id, created_at desc);
create index if not exists idx_audit_logs_shop_entity on audit_logs(shop_id, entity_type, entity_id);

-- ─── Restaurant: KDS display settings ───────────────────────────────────────
-- How many ticket cards per row, and font size — configurable per shop
-- since a TV mounted far from the kitchen line needs bigger text than
-- one sitting right next to the pass.
create table if not exists kds_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  columns integer not null default 3 check (columns between 1 and 4),
  font_scale text not null default 'normal' check (font_scale in ('normal', 'large', 'extra_large')),
  updated_at timestamptz not null default now()
);
alter table kds_settings enable row level security;

-- ─── PHASE 2: Login rate limiting ────────────────────────────────────────────
-- Tracks every login attempt (success or fail) per email. Before
-- attempting sign-in, the app checks: 5+ failed attempts for this email
-- in the last 15 minutes → block, regardless of whether the password
-- given this time is actually correct. Blocks targeted brute-forcing of
-- one account without needing external infra (Redis, WAF).
create table if not exists login_attempts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);
alter table login_attempts enable row level security;
create index if not exists idx_login_attempts_email_time on login_attempts(email, created_at desc);

-- ─── PHASE 2: Password-reset request rate limiting ─────────────────────────
-- Separate from login_attempts — this guards against someone spamming a
-- victim's inbox with reset emails, not credential brute-forcing.
create table if not exists password_reset_requests (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  created_at timestamptz not null default now()
);
alter table password_reset_requests enable row level security;
create index if not exists idx_password_reset_requests_email_time on password_reset_requests(email, created_at desc);

-- ─── PHASE 2: Background job tracking ───────────────────────────────────────
-- No external queue (Redis/SQS) is provisioned for this app, and Vercel
-- Cron on the Hobby plan only runs once a day — useless for near-real-
-- time processing. Instead this uses Next.js's after() API: the
-- request returns immediately with a job row created, then the actual
-- row-by-row work continues after the response is sent. The client
-- polls this table for progress instead of waiting on one long request
-- that risks the serverless function's execution timeout on a large file.
create table if not exists background_jobs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  job_type text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  result jsonb,
  error text,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table background_jobs enable row level security;
create index if not exists idx_background_jobs_shop_created on background_jobs(shop_id, created_at desc);

-- ─── PHASE 2: Structured error logging ──────────────────────────────────────
-- No external service (Sentry etc.) is wired up — that needs an API key
-- only the shop owner/developer can provision. This is the achievable
-- middle ground: every genuinely unexpected failure gets a structured
-- row here instead of only a console.error that vanishes once the
-- serverless function exits, so failures are at least detectable.
create table if not exists error_logs (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid references shops(id) on delete cascade,
  context text not null,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table error_logs enable row level security;
create index if not exists idx_error_logs_shop_created on error_logs(shop_id, created_at desc);

-- ─── PHASE 3: Migration tracking ────────────────────────────────────────────
-- Records which numbered migration files (supabase/migrations/) have
-- been applied to this database — from this point forward, schema
-- changes are tracked file-by-file instead of only living inside one
-- ever-growing schema.sql. See supabase/migrations/README.md.
create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- ─── PHASE 3: Signup rate limiting ──────────────────────────────────────────
-- Max 10 shop signups per IP per hour — guards against mass fake-shop
-- creation (a bot spinning up many accounts), separate from login
-- brute-forcing which login_attempts already covers.
create table if not exists signup_attempts (
  id uuid primary key default uuid_generate_v4(),
  ip_address text not null,
  created_at timestamptz not null default now()
);
alter table signup_attempts enable row level security;
create index if not exists idx_signup_attempts_ip_time on signup_attempts(ip_address, created_at desc);

-- ─── Super Admin: per-shop module toggles ──────────────────────────────────
-- Lets the super admin turn specific add-on features on/off per shop —
-- "pay for what you use" style plans, and a way to reduce load by
-- disabling modules a shop doesn't actually use (their Home dashboard
-- stops querying that module's tables entirely once it's off).
-- Column stores an ARRAY of enabled module keys; a shop with no row
-- set yet (NULL) is treated as "everything enabled" so this never
-- silently breaks any existing shop the moment it ships.
alter table shops add column if not exists enabled_modules text[];

-- ─── Round-off amount on bills ──────────────────────────────────────────────
-- Standard GST-invoice practice: the exact taxable+tax total is rounded
-- to the nearest whole rupee for the amount actually collected, and
-- the tiny adjustment (never more than ±0.50) is shown as its own line
-- on the invoice rather than silently disappearing into the total.
alter table bills add column if not exists round_off_amount numeric(4, 2) not null default 0;

-- ─── Round-off for restaurant orders ─────────────────────────────────────
-- Restaurant orders compute their own totals (recalcOrderTotals), a
-- separate code path from the shared calculateTransactionTotals engine
-- — the whole-rupee round-off rule added there never applied here,
-- which is why restaurant bills kept showing paise amounts.
alter table restaurant_orders add column if not exists round_off_amount numeric(4, 2) not null default 0;

-- ─── Real order-lifecycle timestamps ─────────────────────────────────────
-- Previously only created_at/settled_at/cancelled_at existed at the order
-- level, and items only tracked their CURRENT status (pending/ready/
-- served) with no record of WHEN each transition happened. This meant
-- "how long did the kitchen take" or "when was this actually served"
-- could never be answered — only "what's the status right now".
alter table restaurant_order_items add column if not exists ready_at timestamptz;
alter table restaurant_order_items add column if not exists served_at timestamptz;

-- Order-level "first ready" and "fully served" markers — set once, the
-- first time any item on the order reaches that state, so the order
-- list/detail screen can show one clear timeline without joining and
-- aggregating item timestamps on every read.
alter table restaurant_orders add column if not exists first_ready_at timestamptz;
alter table restaurant_orders add column if not exists served_at timestamptz;
