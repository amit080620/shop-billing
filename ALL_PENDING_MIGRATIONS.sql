-- ============================================================
-- The Ray — Shop Billing SaaS
-- ALL migrations combined — genuinely up-to-date as of this
-- delivery (through 0011). Run this ONCE on an EXISTING
-- database that already has the baseline (0000) applied.
--
-- If this is a genuinely BRAND NEW database, run
-- supabase/schema.sql instead (the full baseline) — do NOT
-- run both, since these assume the baseline already exists.
-- ============================================================

-- ==== 0001_restaurant_order_timestamps.sql ====
-- Order-lifecycle timestamps for restaurant_orders — previously only
-- created_at/settled_at/cancelled_at existed, so there was no real data
-- for "when did this go to kitchen / become ready / get served".
alter table restaurant_orders add column if not exists sent_to_kitchen_at timestamptz;
alter table restaurant_orders add column if not exists first_ready_at timestamptz;
alter table restaurant_orders add column if not exists served_at timestamptz;

-- ==== 0002_restaurant_table_section.sql ====
-- Table I/O/T categorization — Inside / Outside / Takeaway.
alter table restaurant_tables add column if not exists section text
  check (section in ('inside', 'outside', 'takeaway'));

-- ==== 0003_item_modifiers.sql ====
-- Item options/modifiers (e.g. Thali -> Beverage -> Lassi / Chaas).

alter table restaurant_order_items add column if not exists selected_modifiers jsonb not null default '[]'::jsonb;
alter table restaurant_order_items add column if not exists item_note text;

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
  extra_price numeric(12, 2) not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table product_option_choices enable row level security;
create index if not exists idx_product_option_choices_group on product_option_choices(group_id);

-- ==== 0004_price_includes_gst_setting.sql ====
-- Shop-level choice: are product/menu prices the final (GST-inclusive)
-- amount, or the pre-tax base with GST added on top? Both are
-- legitimate; different shop owners price things differently.
alter table shops add column if not exists price_includes_gst boolean not null default true;

-- Captured per-transaction at creation time so historical bills/orders
-- always reverse-calculate correctly even if the shop's setting
-- changes later.
alter table bills add column if not exists price_includes_gst boolean not null default true;
alter table restaurant_orders add column if not exists price_includes_gst boolean not null default true;
alter table rentals add column if not exists price_includes_gst boolean not null default true;

-- ==== 0005_catalog_delivery_charge.sql ====
-- Delivery charge for catalog (online) orders.
alter table catalog_settings add column if not exists delivery_enabled boolean not null default false;
alter table catalog_settings add column if not exists delivery_charge numeric(12, 2) not null default 0;
alter table catalog_order_requests add column if not exists wants_delivery boolean not null default false;
alter table catalog_order_requests add column if not exists delivery_charge numeric(12, 2) not null default 0;

-- ==== 0006_virtual_tables.sql ====
-- Virtual (auto-created online-order) tables get deleted after settlement.
alter table restaurant_tables add column if not exists is_virtual boolean not null default false;

-- ==== 0007_catalog_closed.sql ====
-- Temporary shop closure for the online catalog.
alter table catalog_settings add column if not exists is_closed boolean not null default false;
alter table catalog_settings add column if not exists closed_from date;
alter table catalog_settings add column if not exists closed_until date;

-- ==== 0008_service_job_identifiers.sql ====
-- Flexible device identifiers for Service jobs (IMEI, chassis no.,
-- serial no., etc.) — a category hint plus an open-ended list of
-- label/value pairs, since different device types (and even multiple
-- IDs on the same device, like dual-SIM IMEIs) don't fit fixed columns.
alter table service_jobs add column if not exists device_category text;
alter table service_jobs add column if not exists identifiers jsonb not null default '[]'::jsonb;

-- ==== 0009_service_job_parts.sql ====
-- Parts drawn from shop inventory to complete a repair job — links
-- service jobs to genuine products, so stock is deducted correctly
-- when the job is billed (see service.ts deliverJobAction).
create table if not exists service_job_parts (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references service_jobs(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);
alter table service_job_parts enable row level security;
create index if not exists idx_service_job_parts_job on service_job_parts(job_id);

-- ==== 0010_loyalty_program.sql ====
-- Loyalty program — genuinely opt-in (points_per_100 = 0 means off, the
-- default for every existing shop so nothing changes until an owner
-- deliberately turns it on in Settings).
alter table shops add column if not exists loyalty_points_per_100 numeric(6, 2) not null default 0;
alter table shops add column if not exists loyalty_redemption_value numeric(6, 2) not null default 1;
alter table customers add column if not exists loyalty_points integer not null default 0;

create or replace function increment_loyalty_points(p_customer_id uuid, p_points integer)
returns void language sql as $$
  update customers
  set loyalty_points = loyalty_points + p_points
  where id = p_customer_id;
$$;

create or replace function redeem_loyalty_points(p_customer_id uuid, p_points integer)
returns void language sql as $$
  update customers
  set loyalty_points = greatest(0, loyalty_points - p_points)
  where id = p_customer_id;
$$;


-- ==== 0011_team_viewers.sql ====
-- Read-only "Leads Dashboard" access — genuinely separate from
-- super_admins. See schema.sql for the full rationale.
create table if not exists team_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table team_viewers enable row level security;

