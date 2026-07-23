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
  price numeric(12, 2) not null default 0,
  gst_percent numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);
alter table products add column if not exists hsn_code text;
alter table products add column if not exists unit text not null default 'NOS';

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

create table if not exists bill_items (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid not null references bills(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  hsn_code text,
  quantity numeric(12, 2) not null,
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

-- Payments RECEIVED from customers against outstanding credit (receivables).
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  staff_id uuid not null references staff(id),
  amount numeric(12, 2) not null,
  note text,
  created_at timestamptz not null default now()
);

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
  payable_amount numeric(12, 2) not null default 0,
  itc_eligible boolean not null default true,
  reverse_charge boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null, -- product name snapshot, or free-text item
  hsn_code text,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  line_subtotal numeric(12, 2) not null,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  line_gst numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null
);

-- Payments WE make to vendors against payables.
create table if not exists purchase_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  staff_id uuid not null references staff(id),
  amount numeric(12, 2) not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_shop on products(shop_id);
create index if not exists idx_customers_shop on customers(shop_id);
create index if not exists idx_vendors_shop on vendors(shop_id);
create index if not exists idx_bills_shop on bills(shop_id);
create index if not exists idx_bills_customer on bills(customer_id);
create index if not exists idx_bills_fy on bills(shop_id, financial_year);
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
