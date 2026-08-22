-- ============================================================
-- The Ray — Shop Billing SaaS
-- ALL migrations combined — genuinely up-to-date (through 0019).
-- Run this ONCE on an EXISTING database that already has the
-- baseline (0000) applied.
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

-- ==== 0012_fast_billing.sql ====
-- Fast Billing — genuinely opt-in (default false for every existing
-- shop, so nothing changes until an owner deliberately turns it on).
alter table shops add column if not exists fast_billing_enabled boolean not null default false;

-- Per-product Fast Billing display config — genuinely separate from
-- the product's normal catalog visibility (show_in_catalog is for the
-- public online storefront, this is for the in-shop quick-tile grid).
alter table products add column if not exists show_in_fast_billing boolean not null default false;
alter table products add column if not exists fast_billing_order integer not null default 0;

-- ==== 0013_missing_indexes.sql ====
-- Genuine performance fix — staff can grow to several rows per shop
-- and is queried on every staff-management screen. (categories was
-- also checked, but it already has an implicit index via its own
-- unique(shop_id, name) constraint, so it genuinely doesn't need a
-- separate one.)
create index if not exists idx_staff_shop_id on staff(shop_id);

-- ==== 0014_medicine_library.sql ====
-- Genuine per-shop medicine library — grows automatically as staff
-- types medicine names into prescriptions, so a name typed once never
-- needs to be typed in full again.
create table if not exists shop_medicine_library (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  medicine_name text not null,
  usage_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shop_id, medicine_name)
);
create index if not exists idx_shop_medicine_library_shop_id on shop_medicine_library(shop_id);
alter table shop_medicine_library enable row level security;

-- ==== 0015_treatment_plans.sql ====
-- Genuine dental Treatment Plan → Quotation → Invoice workflow.
create table if not exists treatment_plans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  patient_id uuid references customers(id),
  patient_name text not null,
  patient_phone text,
  doctor_name text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table treatment_plans enable row level security;
create index if not exists idx_treatment_plans_shop on treatment_plans(shop_id);
create index if not exists idx_treatment_plans_patient on treatment_plans(patient_id);

create table if not exists treatment_plan_items (
  id uuid primary key default uuid_generate_v4(),
  treatment_plan_id uuid not null references treatment_plans(id) on delete cascade,
  tooth_number text,
  procedure_name text not null,
  description text,
  estimated_cost numeric(12,2) not null default 0,
  status text not null default 'planned' check (status in ('planned', 'completed', 'billed')),
  completed_at timestamptz,
  sort_order integer not null default 0
);
alter table treatment_plan_items enable row level security;
create index if not exists idx_treatment_plan_items_plan on treatment_plan_items(treatment_plan_id);

-- ==== 0016_medicine_library_details.sql ====
-- Genuine expansion of the medicine library to hold rich clinical data
-- (for CSV import of a real medicine database), not just a bare name.
alter table shop_medicine_library add column if not exists price numeric(10,2);
alter table shop_medicine_library add column if not exists manufacturer_name text;
alter table shop_medicine_library add column if not exists medicine_type text;
alter table shop_medicine_library add column if not exists pack_size_label text;
alter table shop_medicine_library add column if not exists composition text;
alter table shop_medicine_library add column if not exists description text;
alter table shop_medicine_library add column if not exists side_effects text;
alter table shop_medicine_library add column if not exists is_discontinued boolean not null default false;

-- ==== 0017_medicine_full_fields.sql ====
-- Genuine full-field expansion of the medicine library — capturing
-- every column from a real-world medicine database export, not just
-- a subset.
alter table shop_medicine_library add column if not exists short_composition1 text;
alter table shop_medicine_library add column if not exists short_composition2 text;
alter table shop_medicine_library add column if not exists drug_interactions jsonb;

-- Genuine per-shop control over exactly which medicine-detail fields
-- appear on a printed prescription — a shop decides, field by field,
-- what makes their Rx as detailed (or as simple) as they want.
alter table prescription_settings add column if not exists rx_show_price boolean not null default false;
alter table prescription_settings add column if not exists rx_show_manufacturer boolean not null default false;
alter table prescription_settings add column if not exists rx_show_composition boolean not null default true;
alter table prescription_settings add column if not exists rx_show_pack_size boolean not null default false;
alter table prescription_settings add column if not exists rx_show_side_effects boolean not null default false;
alter table prescription_settings add column if not exists rx_show_drug_interactions boolean not null default false;
alter table prescription_settings add column if not exists rx_show_description boolean not null default false;

-- ==== 0018_treatment_plan_dental_chart.sql ====
-- Genuinely attach the tooth chart directly to a treatment plan, so
-- the printed quotation given to the patient can show visually which
-- teeth are being treated, not just a text list.
alter table treatment_plans add column if not exists dental_chart jsonb;

-- ==== 0019_prescription_templates.sql ====
-- Genuine full prescription templates — a doctor saves a whole Rx
-- (chief complaint, diagnosis, advice, medicines) as a reusable
-- preset like "Fever" or "Viral", tap it once for a new patient and
-- edit the specifics from there instead of typing everything fresh.
create table if not exists prescription_templates (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  chief_complaint text,
  diagnosis text,
  advice text,
  custom_sections jsonb not null default '[]'::jsonb,
  medicines jsonb not null default '[]'::jsonb,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);
create index if not exists idx_prescription_templates_shop on prescription_templates(shop_id);
alter table prescription_templates enable row level security;

-- Genuine growing per-field phrase library — every Chief Complaint,
-- Diagnosis, or Advice text typed once becomes a quick-tap chip above
-- that same field on the next prescription, the busiest phrases
-- floating to the top over time (same pattern as the medicine
-- library, applied to free-text fields instead of medicine names).
create table if not exists prescription_quick_phrases (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  field_label text not null,
  phrase text not null,
  usage_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  unique (shop_id, field_label, phrase)
);
create index if not exists idx_prescription_quick_phrases_shop on prescription_quick_phrases(shop_id, field_label);
alter table prescription_quick_phrases enable row level security;

