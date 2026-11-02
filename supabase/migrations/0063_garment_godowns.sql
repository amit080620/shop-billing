-- Garment shops: styles with size × colour variants, godowns, godown-wise stock, transfers with stock
-- in transit, damage and missing-stock registers, godown stock counts, supplier (purchase) returns,
-- customer-return disposition to a godown, and financial-year closing with carry forward.
--
-- Additive. Existing tables keep their rows and meaning, and existing screens behave as before:
--   • shops.business_type's list gains 'garment';
--   • products gains four nullable columns (style_id, variant_colour, variant_size, sku);
--   • vendor_balances() also subtracts posted supplier returns — identical for a shop with none.
-- Everything else is new tables and new functions.
--
-- How stock is kept (THERAY_GARMENT_PLAN.md):
--   • Each colour × size is its own item (products row): its own barcode, price and stock, so
--     billing, scanning, GST, returns and labels work unchanged. product_styles groups them.
--   • products.stock_quantity stays the shop's whole SALEABLE stock — what billing sells from, through
--     move_stock (0060), never below zero.
--   • godown_stock holds each non-default godown's saleable quantity, and the damaged quantity of
--     every godown. The default godown (the shop floor, where the counter sells) holds the rest:
--     default = stock_quantity − the other godowns. Sales and purchases (unchanged) therefore land on
--     the default godown; a negative default means the counter sold more than the floor held.
--   • Stock in transit, damaged stock and transit shortages awaiting reconciliation are outside the
--     saleable total, so they can never be billed.
--   • Every movement goes through the functions below: they lock the document and the items, check
--     availability, move the saleable total with move_stock, and write inventory_ledger, which can't
--     be changed or deleted. Documents are never deleted; corrections are new entries.
--
-- Only the server (service role) may call the functions. Run after 0060 and 0061.
-- Rollback: see the end of this file.

begin;

-- ─── 1. Business type ──────────────────────────────────────────────────────────
alter table shops drop constraint if exists shops_business_type_check;
alter table shops add constraint shops_business_type_check
  check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'transport', 'service', 'salon', 'jewellery', 'clinic', 'gym', 'lab', 'hotel', 'wholesale', 'garment', 'general'));

-- ─── 2. Styles and variants ────────────────────────────────────────────────────
create table if not exists product_styles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  code text,
  brand text,
  category_id uuid references categories(id) on delete set null,
  hsn_code text,
  gst_percent numeric(5, 2) not null default 5 check (gst_percent >= 0),
  fabric text,
  season text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_product_styles_shop on product_styles(shop_id);
create unique index if not exists uq_product_styles_code on product_styles(shop_id, lower(code)) where code is not null;
alter table product_styles enable row level security;

alter table products add column if not exists style_id uuid references product_styles(id) on delete set null;
alter table products add column if not exists variant_colour text;
alter table products add column if not exists variant_size text;
alter table products add column if not exists sku text;
create index if not exists idx_products_style on products(style_id) where style_id is not null;
create unique index if not exists uq_products_style_variant
  on products(style_id, lower(coalesce(variant_colour, '')), lower(coalesce(variant_size, ''))) where style_id is not null;
create unique index if not exists uq_products_sku on products(shop_id, lower(sku)) where sku is not null;

-- ─── 3. Godowns and settings ───────────────────────────────────────────────────
create table if not exists godowns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  code text not null check (length(trim(code)) > 0),
  kind text not null default 'main' check (kind in ('main', 'branch', 'shop_floor', 'warehouse', 'transit')),
  address text,
  state text,
  state_code text,
  pin_code text,
  contact_person text,
  phone text,
  gstin text,
  branch_id uuid references branches(id) on delete set null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  remarks text,
  created_at timestamptz not null default now(),
  check (not (is_default and not is_active))
);
create index if not exists idx_godowns_shop on godowns(shop_id);
create unique index if not exists uq_godowns_code on godowns(shop_id, lower(code));
create unique index if not exists uq_godowns_one_default on godowns(shop_id) where is_default;
alter table godowns enable row level security;

create table if not exists garment_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  transfer_approval boolean not null default true,
  blind_count boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table garment_settings enable row level security;

-- saleable: only for non-default godowns (the default's is the rest of the total, never stored).
create table if not exists godown_stock (
  shop_id uuid not null references shops(id) on delete cascade,
  godown_id uuid not null references godowns(id) on delete restrict,
  product_id uuid not null references products(id) on delete cascade,
  saleable numeric(12, 3) not null default 0 check (saleable >= 0),
  damaged numeric(12, 3) not null default 0 check (damaged >= 0),
  updated_at timestamptz not null default now(),
  primary key (godown_id, product_id)
);
create index if not exists idx_godown_stock_shop_product on godown_stock(shop_id, product_id);
alter table godown_stock enable row level security;

-- ─── 4. The ledger (append-only) ───────────────────────────────────────────────
-- bucket: saleable / damaged at a godown; transit (on the way, godown = destination); pending (a
-- transit shortage awaiting reconciliation, godown = destination). No foreign keys on purpose: the
-- history outlives a deleted item; names are kept with each row.
create table if not exists inventory_ledger (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  godown_id uuid,
  godown_name text,
  bucket text not null check (bucket in ('saleable', 'damaged', 'transit', 'pending')),
  quantity numeric(12, 3) not null check (quantity <> 0),
  kind text not null,
  ref_type text,
  ref_id uuid,
  ref_number text,
  staff_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inventory_ledger_shop_time on inventory_ledger(shop_id, created_at desc);
create index if not exists idx_inventory_ledger_product on inventory_ledger(shop_id, product_id, created_at desc);
create index if not exists idx_inventory_ledger_ref on inventory_ledger(ref_type, ref_id);
alter table inventory_ledger enable row level security;

create or replace function public.inventory_ledger_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Only the removal of the whole shop (cascade) may take rows away; nothing may change them.
  if tg_op = 'DELETE' and not exists (select 1 from shops where id = old.shop_id) then
    return old;
  end if;
  raise exception 'ledger_append_only' using errcode = '42501', hint = 'Stock ledger entries are never changed or deleted; post a correcting entry.';
end;
$$;
drop trigger if exists trg_inventory_ledger_append_only on inventory_ledger;
create trigger trg_inventory_ledger_append_only
  before update or delete on inventory_ledger
  for each row execute function public.inventory_ledger_append_only();

-- ─── 5. Document numbers (per shop, per kind, per financial year) ──────────────
create table if not exists godown_doc_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null,
  financial_year text not null,
  next_number integer not null default 1,
  primary key (shop_id, kind, financial_year)
);
alter table godown_doc_counters enable row level security;

-- 'TR/2026-27/0001' — the financial year (April–March) of today in India.
create or replace function public.next_godown_doc_number(p_shop uuid, p_kind text, p_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start integer := case when extract(month from v_today) >= 4 then extract(year from v_today)::int else extract(year from v_today)::int - 1 end;
  v_fy text := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_n integer;
begin
  insert into godown_doc_counters (shop_id, kind, financial_year, next_number)
  values (p_shop, p_kind, v_fy, 2)
  on conflict (shop_id, kind, financial_year) do update set next_number = godown_doc_counters.next_number + 1
  returning next_number - 1 into v_n;
  return p_prefix || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;

-- ─── 6. Documents ──────────────────────────────────────────────────────────────
create table if not exists godown_moves (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  from_godown_id uuid not null references godowns(id),
  to_godown_id uuid not null references godowns(id),
  kind text not null default 'move' check (kind in ('move', 'put_away', 'return_to_godown')),
  note text,
  staff_id uuid,
  created_at timestamptz not null default now(),
  check (from_godown_id <> to_godown_id)
);
create index if not exists idx_godown_moves_shop on godown_moves(shop_id, created_at desc);
alter table godown_moves enable row level security;

create table if not exists stock_transfers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  transfer_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  from_godown_id uuid not null references godowns(id),
  to_godown_id uuid not null references godowns(id),
  status text not null default 'draft' check (status in ('draft', 'requested', 'approved', 'dispatched', 'partially_received', 'received', 'closed', 'cancelled')),
  remarks text,
  requested_by uuid, requested_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  dispatched_by uuid, dispatched_at timestamptz,
  received_by uuid, received_at timestamptz,
  closed_by uuid, closed_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  -- Movement papers (stock transfer note / delivery challan / e-way bill references).
  from_gstin text, to_gstin text, from_state_code text, to_state_code text,
  movement_reason text,
  consignment_value numeric(14, 2) not null default 0,
  transporter text, vehicle_number text, challan_ref text, eway_bill_no text,
  gst_review boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_godown_id <> to_godown_id)
);
create index if not exists idx_stock_transfers_shop on stock_transfers(shop_id, created_at desc);
create unique index if not exists uq_stock_transfers_number on stock_transfers(shop_id, number);
alter table stock_transfers enable row level security;

create table if not exists stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references stock_transfers(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  dispatched numeric(12, 3) not null default 0 check (dispatched >= 0),
  received numeric(12, 3) not null default 0 check (received >= 0),
  damaged numeric(12, 3) not null default 0 check (damaged >= 0),
  shortage numeric(12, 3) not null default 0 check (shortage >= 0),
  unit_value numeric(12, 2) not null default 0 check (unit_value >= 0),
  note text,
  check (received + damaged + shortage <= dispatched)
);
create index if not exists idx_stock_transfer_items_transfer on stock_transfer_items(transfer_id);
alter table stock_transfer_items enable row level security;

create table if not exists stock_transfer_receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  transfer_id uuid not null references stock_transfers(id) on delete cascade,
  client_ref text,
  lines jsonb not null default '[]'::jsonb,
  received_by uuid,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_stock_transfer_receipts_ref on stock_transfer_receipts(transfer_id, client_ref) where client_ref is not null;
alter table stock_transfer_receipts enable row level security;

create table if not exists damage_reports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  report_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  godown_id uuid not null references godowns(id),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  reason text not null check (reason in ('manufacturing_defect', 'torn', 'stained', 'colour_damage', 'water_damage', 'packaging_damage', 'customer_return_damage', 'handling_damage', 'other')),
  description text,
  image_url text,
  estimated_value numeric(12, 2) not null default 0 check (estimated_value >= 0),
  status text not null default 'reported' check (status in ('reported', 'under_review', 'approved', 'rejected', 'dispositioned')),
  disposition text check (disposition in ('return_to_supplier', 'repair', 'discounted_sale', 'scrap', 'non_saleable', 'other')),
  source_return_item_id uuid,
  reported_by uuid, reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  rejected_by uuid, rejected_at timestamptz,
  dispositioned_by uuid, dispositioned_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_damage_reports_shop on damage_reports(shop_id, created_at desc);
create unique index if not exists uq_damage_reports_number on damage_reports(shop_id, number);
alter table damage_reports enable row level security;

create table if not exists stock_discrepancies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  report_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  godown_id uuid not null references godowns(id),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  kind text not null check (kind in ('missing', 'count_shortage', 'theft', 'unexplained', 'transit_shortage', 'handling_loss', 'count_difference')),
  system_qty numeric(12, 3) not null,
  physical_qty numeric(12, 3) not null check (physical_qty >= 0),
  difference numeric(12, 3) not null,
  estimated_value numeric(12, 2) not null default 0,
  reason text,
  investigation_notes text,
  resolution text check (resolution in ('written_off', 'found', 'recovered', 'other')),
  attachments text[] not null default '{}',
  transfer_id uuid references stock_transfers(id),
  status text not null default 'reported' check (status in ('reported', 'investigation', 'reviewed', 'approved', 'rejected', 'adjusted', 'closed')),
  reported_by uuid,
  investigated_by uuid, investigated_at timestamptz,
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  rejected_by uuid, rejected_at timestamptz,
  adjusted_by uuid, adjusted_at timestamptz,
  closed_by uuid, closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (difference = physical_qty - system_qty)
);
create index if not exists idx_stock_discrepancies_shop on stock_discrepancies(shop_id, created_at desc);
create unique index if not exists uq_stock_discrepancies_number on stock_discrepancies(shop_id, number);
alter table stock_discrepancies enable row level security;

create table if not exists godown_counts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  godown_id uuid not null references godowns(id),
  count_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  blind boolean not null default false,
  purpose text not null default 'count' check (purpose in ('count', 'opening')),
  status text not null default 'counting' check (status in ('counting', 'submitted', 'approved', 'rejected', 'posted', 'cancelled')),
  note text,
  created_by uuid,
  submitted_by uuid, submitted_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  rejected_by uuid, rejected_at timestamptz,
  posted_by uuid, posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_godown_counts_shop on godown_counts(shop_id, created_at desc);
create unique index if not exists uq_godown_counts_number on godown_counts(shop_id, number);
alter table godown_counts enable row level security;

create table if not exists godown_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references godown_counts(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  system_qty numeric(12, 3) not null,
  physical_qty numeric(12, 3) not null check (physical_qty >= 0),
  posted_difference numeric(12, 3),
  unique (count_id, product_id)
);
alter table godown_count_items enable row level security;

create table if not exists purchase_returns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  number text not null,
  vendor_id uuid not null references vendors(id),
  purchase_id uuid not null references purchases(id),
  godown_id uuid not null references godowns(id),
  return_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  reason text,
  taxable_value numeric(14, 2) not null default 0,
  gst_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  -- What the shop now owes the vendor less (counted by vendor_balances once posted).
  credit_amount numeric(14, 2) not null default 0 check (credit_amount >= 0),
  debit_note_ref text,
  transporter text, vehicle_number text, lr_number text,
  created_by uuid,
  posted_by uuid, posted_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_purchase_returns_shop on purchase_returns(shop_id, created_at desc);
create index if not exists idx_purchase_returns_vendor on purchase_returns(shop_id, vendor_id);
create unique index if not exists uq_purchase_returns_number on purchase_returns(shop_id, number);
alter table purchase_returns enable row level security;

create table if not exists purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references purchase_returns(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  purchase_item_id uuid not null references purchase_items(id),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  rate numeric(12, 2) not null check (rate >= 0),
  gst_percent numeric(5, 2) not null default 0,
  taxable_value numeric(14, 2) not null default 0,
  gst_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  from_damaged boolean not null default false,
  damage_report_id uuid references damage_reports(id)
);
create index if not exists idx_purchase_return_items_return on purchase_return_items(return_id);
create index if not exists idx_purchase_return_items_purchase_item on purchase_return_items(purchase_item_id);
alter table purchase_return_items enable row level security;

create table if not exists return_dispositions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  return_id uuid not null references returns(id),
  return_item_id uuid not null references return_items(id),
  product_id uuid,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  disposition text not null check (disposition in ('keep', 'to_godown', 'damaged', 'inspection', 'repair')),
  godown_id uuid references godowns(id),
  damage_report_id uuid references damage_reports(id),
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_return_dispositions_item on return_dispositions(return_item_id);
alter table return_dispositions enable row level security;

create table if not exists fy_stock_closings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  closing_date date not null,
  opening_financial_year text,
  opening_date date,
  valuation_method text not null default 'latest_purchase_cost' check (valuation_method in ('latest_purchase_cost')),
  status text not null default 'closed' check (status in ('closed', 'carried_forward')),
  total_quantity numeric(14, 3) not null default 0,
  total_value numeric(16, 2) not null default 0,
  negative_lines integer not null default 0,
  note text,
  closed_by uuid,
  carried_by uuid, carried_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shop_id, financial_year)
);
create unique index if not exists uq_fy_stock_closings_opening on fy_stock_closings(shop_id, opening_financial_year) where opening_financial_year is not null;
alter table fy_stock_closings enable row level security;

create table if not exists fy_stock_closing_lines (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references fy_stock_closings(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  style_id uuid,
  variant_colour text,
  variant_size text,
  sku text,
  barcode text,
  unit text,
  godown_id uuid,
  godown_name text,
  bucket text not null check (bucket in ('saleable', 'damaged', 'transit', 'pending')),
  quantity numeric(12, 3) not null,
  unit_cost numeric(12, 2) not null default 0,
  value numeric(16, 2) not null default 0,
  ref_type text,
  ref_id uuid
);
create index if not exists idx_fy_stock_closing_lines_closing on fy_stock_closing_lines(closing_id);
alter table fy_stock_closing_lines enable row level security;

-- ─── 7. Internal helpers ───────────────────────────────────────────────────────
create or replace function public.gd_default(p_shop uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from godowns where shop_id = p_shop and is_default limit 1;
$$;

-- The godown, if it is this shop's and active; otherwise the whole move is refused.
create or replace function public.gd_godown(p_shop uuid, p_godown uuid)
returns godowns
language plpgsql
set search_path = public, pg_temp
as $$
declare
  g godowns;
begin
  select * into g from godowns where id = p_godown and shop_id = p_shop;
  if not found then
    raise exception 'unknown_godown' using errcode = 'P0002', detail = jsonb_build_object('godown_id', p_godown)::text;
  end if;
  if not g.is_active then
    raise exception 'inactive_godown' using errcode = 'P0001', detail = jsonb_build_object('godown_id', p_godown, 'name', g.name)::text;
  end if;
  return g;
end;
$$;

-- The item, locked, if it is this shop's and counted in stock.
create or replace function public.gd_item(p_shop uuid, p_product uuid)
returns products
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p products;
begin
  select * into p from products where id = p_product and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_item' using errcode = 'P0002', detail = jsonb_build_object('product_id', p_product)::text;
  end if;
  if not p.track_inventory then
    raise exception 'not_tracked' using errcode = 'P0001', detail = jsonb_build_object('product_id', p_product, 'name', p.name)::text,
      hint = 'Switch on "Track stock" for the item before moving it between godowns.';
  end if;
  return p;
end;
$$;

-- Saleable stock of an item at a godown. The default godown's is the rest of the total.
create or replace function public.gd_available(p_shop uuid, p_godown uuid, p_product uuid)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_default uuid := gd_default(p_shop);
  v_total numeric;
  v_others numeric;
begin
  if p_godown = v_default then
    select stock_quantity into v_total from products where id = p_product and shop_id = p_shop;
    select coalesce(sum(saleable), 0) into v_others from godown_stock where shop_id = p_shop and product_id = p_product and godown_id <> v_default;
    return coalesce(v_total, 0) - v_others;
  end if;
  return coalesce((select saleable from godown_stock where shop_id = p_shop and godown_id = p_godown and product_id = p_product), 0);
end;
$$;

create or replace function public.gd_ledger(
  p_shop uuid, p_product uuid, p_product_name text, p_godown uuid, p_bucket text, p_qty numeric,
  p_kind text, p_ref_type text, p_ref_id uuid, p_ref_number text, p_staff uuid, p_note text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_qty = 0 then
    return;
  end if;
  insert into inventory_ledger (shop_id, product_id, product_name, godown_id, godown_name, bucket, quantity, kind, ref_type, ref_id, ref_number, staff_id, note)
  values (p_shop, p_product, p_product_name, p_godown, (select name from godowns where id = p_godown), p_bucket, p_qty, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
end;
$$;

-- Goods leave the saleable pool from a godown (to transit, damaged, a write-off, the supplier).
create or replace function public.gd_saleable_out(
  p_shop uuid, p_godown uuid, p_product uuid, p_qty numeric,
  p_kind text, p_ref_type text, p_ref_id uuid, p_ref_number text, p_staff uuid, p_note text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p products := gd_item(p_shop, p_product);
  g godowns := gd_godown(p_shop, p_godown);
  v_av numeric;
begin
  if p_qty <= 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  v_av := gd_available(p_shop, p_godown, p_product);
  if v_av < p_qty then
    raise exception 'insufficient_godown_stock' using errcode = 'P0001',
      detail = jsonb_build_object('product_id', p_product, 'name', p.name, 'godown_id', p_godown, 'godown', g.name, 'requested', p_qty, 'available', v_av)::text;
  end if;
  if not g.is_default then
    update godown_stock set saleable = saleable - p_qty, updated_at = now() where godown_id = p_godown and product_id = p_product;
  end if;
  perform move_stock(p_shop, jsonb_build_array(jsonb_build_object('product_id', p_product, 'quantity', p_qty)), '[]'::jsonb, false);
  perform gd_ledger(p_shop, p_product, p.name, p_godown, 'saleable', -p_qty, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
end;
$$;

-- Goods enter the saleable pool at a godown (a receipt, a repair, a count found more).
create or replace function public.gd_saleable_in(
  p_shop uuid, p_godown uuid, p_product uuid, p_qty numeric,
  p_kind text, p_ref_type text, p_ref_id uuid, p_ref_number text, p_staff uuid, p_note text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p products := gd_item(p_shop, p_product);
  g godowns := gd_godown(p_shop, p_godown);
begin
  if p_qty <= 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if not g.is_default then
    insert into godown_stock (shop_id, godown_id, product_id, saleable) values (p_shop, p_godown, p_product, p_qty)
    on conflict (godown_id, product_id) do update set saleable = godown_stock.saleable + excluded.saleable, updated_at = now();
  end if;
  perform move_stock(p_shop, '[]'::jsonb, jsonb_build_array(jsonb_build_object('product_id', p_product, 'quantity', p_qty)), false);
  perform gd_ledger(p_shop, p_product, p.name, p_godown, 'saleable', p_qty, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
end;
$$;

-- Saleable goods move from one godown to another on the spot; the shop's total doesn't change.
create or replace function public.gd_saleable_move(
  p_shop uuid, p_from uuid, p_to uuid, p_product uuid, p_qty numeric,
  p_kind text, p_ref_type text, p_ref_id uuid, p_ref_number text, p_staff uuid, p_note text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p products := gd_item(p_shop, p_product);
  gf godowns := gd_godown(p_shop, p_from);
  gt godowns := gd_godown(p_shop, p_to);
  v_av numeric;
begin
  if p_qty <= 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_from = p_to then
    raise exception 'same_godown' using errcode = '22023';
  end if;
  v_av := gd_available(p_shop, p_from, p_product);
  if v_av < p_qty then
    raise exception 'insufficient_godown_stock' using errcode = 'P0001',
      detail = jsonb_build_object('product_id', p_product, 'name', p.name, 'godown_id', p_from, 'godown', gf.name, 'requested', p_qty, 'available', v_av)::text;
  end if;
  if not gf.is_default then
    update godown_stock set saleable = saleable - p_qty, updated_at = now() where godown_id = p_from and product_id = p_product;
  end if;
  if not gt.is_default then
    insert into godown_stock (shop_id, godown_id, product_id, saleable) values (p_shop, p_to, p_product, p_qty)
    on conflict (godown_id, product_id) do update set saleable = godown_stock.saleable + excluded.saleable, updated_at = now();
  end if;
  perform gd_ledger(p_shop, p_product, p.name, p_from, 'saleable', -p_qty, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
  perform gd_ledger(p_shop, p_product, p.name, p_to, 'saleable', p_qty, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
end;
$$;

-- Damaged (non-saleable) stock at a godown changes by p_delta.
create or replace function public.gd_damaged(
  p_shop uuid, p_godown uuid, p_product uuid, p_delta numeric,
  p_kind text, p_ref_type text, p_ref_id uuid, p_ref_number text, p_staff uuid, p_note text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p products := gd_item(p_shop, p_product);
  g godowns;
  v_now numeric;
begin
  select * into g from godowns where id = p_godown and shop_id = p_shop;
  if not found then
    raise exception 'unknown_godown' using errcode = 'P0002', detail = jsonb_build_object('godown_id', p_godown)::text;
  end if;
  if p_delta = 0 then
    return;
  end if;
  select damaged into v_now from godown_stock where godown_id = p_godown and product_id = p_product for update;
  if coalesce(v_now, 0) + p_delta < 0 then
    raise exception 'insufficient_damaged_stock' using errcode = 'P0001',
      detail = jsonb_build_object('product_id', p_product, 'name', p.name, 'godown_id', p_godown, 'requested', -p_delta, 'available', coalesce(v_now, 0))::text;
  end if;
  insert into godown_stock (shop_id, godown_id, product_id, damaged) values (p_shop, p_godown, p_product, greatest(p_delta, 0))
  on conflict (godown_id, product_id) do update set damaged = godown_stock.damaged + p_delta, updated_at = now();
  perform gd_ledger(p_shop, p_product, p.name, p_godown, 'damaged', p_delta, p_kind, p_ref_type, p_ref_id, p_ref_number, p_staff, p_note);
end;
$$;

-- Items of a list locked in id order first, so two documents sharing items never wait in a circle.
create or replace function public.gd_lock_items(p_shop uuid, p_products uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  select 1 from products where shop_id = p_shop and id = any(p_products) order by id for update;
$$;

-- ─── 8. Godowns: the default, and moves on the spot ────────────────────────────
-- Makes a godown the default (the shop floor the counter sells from). The old default's share is
-- written to its own row first, so no godown's stock changes.
create or replace function public.godown_set_default(p_shop uuid, p_godown uuid, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old uuid := gd_default(p_shop);
  g godowns := gd_godown(p_shop, p_godown);
  r record;
begin
  if v_old = p_godown then
    return;
  end if;
  if v_old is not null then
    perform 1 from products where shop_id = p_shop order by id for update;
    for r in
      select p.id, p.stock_quantity - coalesce((select sum(gs.saleable) from godown_stock gs where gs.shop_id = p_shop and gs.product_id = p.id and gs.godown_id <> v_old), 0) as share
      from products p where p.shop_id = p_shop and p.track_inventory
    loop
      if r.share < 0 then
        raise exception 'default_negative' using errcode = 'P0001', detail = jsonb_build_object('product_id', r.id, 'share', r.share)::text,
          hint = 'The current default godown shows less than zero of an item — record the missing move or count it first.';
      end if;
      if r.share > 0 then
        insert into godown_stock (shop_id, godown_id, product_id, saleable) values (p_shop, v_old, r.id, r.share)
        on conflict (godown_id, product_id) do update set saleable = r.share, updated_at = now();
      end if;
    end loop;
    update godowns set is_default = false where id = v_old;
  end if;
  update godown_stock set saleable = 0, updated_at = now() where godown_id = p_godown;
  update godowns set is_default = true where id = p_godown;
end;
$$;

-- Saleable goods moved between two godowns on the spot (shop floor ↔ godown, putting a purchase
-- away, goods back from the floor). p_lines: [{"product_id", "quantity"}]. Returns the move's id.
create or replace function public.godown_move_now(
  p_shop uuid, p_from uuid, p_to uuid, p_lines jsonb, p_kind text, p_staff uuid, p_note text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_number text;
  e jsonb;
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'at least one line is needed';
  end if;
  perform gd_godown(p_shop, p_from);
  perform gd_godown(p_shop, p_to);
  perform gd_lock_items(p_shop, array(select (x ->> 'product_id')::uuid from jsonb_array_elements(p_lines) x));
  v_number := next_godown_doc_number(p_shop, 'move', 'MV');
  insert into godown_moves (shop_id, number, from_godown_id, to_godown_id, kind, note, staff_id)
  values (p_shop, v_number, p_from, p_to, coalesce(p_kind, 'move'), p_note, p_staff)
  returning id into v_id;
  for e in select * from jsonb_array_elements(p_lines) loop
    perform gd_saleable_move(p_shop, p_from, p_to, (e ->> 'product_id')::uuid, (e ->> 'quantity')::numeric, coalesce(p_kind, 'move'), 'move', v_id, v_number, p_staff, p_note);
  end loop;
  return v_id;
end;
$$;

-- ─── 9. Transfers ──────────────────────────────────────────────────────────────
-- request / approve / cancel. Cancelling is allowed only before dispatch; after it, corrections are
-- receipts, shortages and adjustments — never a silent delete.
create or replace function public.transfer_action(p_shop uuid, p_transfer uuid, p_action text, p_staff uuid, p_note text default null)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t stock_transfers;
begin
  select * into t from stock_transfers where id = p_transfer and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_transfer' using errcode = 'P0002';
  end if;
  if p_action = 'request' and t.status = 'draft' then
    update stock_transfers set status = 'requested', requested_by = p_staff, requested_at = now() where id = p_transfer;
    return 'requested';
  elsif p_action = 'approve' and t.status = 'requested' then
    update stock_transfers set status = 'approved', approved_by = p_staff, approved_at = now() where id = p_transfer;
    return 'approved';
  elsif p_action = 'cancel' and t.status in ('draft', 'requested', 'approved') then
    update stock_transfers set status = 'cancelled', cancelled_by = p_staff, cancelled_at = now(), cancel_reason = p_note where id = p_transfer;
    return 'cancelled';
  end if;
  raise exception 'transfer_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', t.status, 'action', p_action)::text;
end;
$$;

-- Dispatch: every line leaves the source godown's saleable stock and goes into transit. With
-- approval switched on (garment_settings) only an approved transfer can go.
create or replace function public.transfer_dispatch(p_shop uuid, p_transfer uuid, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t stock_transfers;
  i record;
  v_approval boolean := coalesce((select transfer_approval from garment_settings where shop_id = p_shop), true);
begin
  select * into t from stock_transfers where id = p_transfer and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_transfer' using errcode = 'P0002';
  end if;
  if not (t.status = 'approved' or (not v_approval and t.status in ('draft', 'requested'))) then
    raise exception 'transfer_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', t.status, 'action', 'dispatch')::text;
  end if;
  if not exists (select 1 from stock_transfer_items where transfer_id = p_transfer) then
    raise exception 'transfer_empty' using errcode = '22023';
  end if;
  perform gd_godown(p_shop, t.from_godown_id);
  perform gd_godown(p_shop, t.to_godown_id);
  perform gd_lock_items(p_shop, array(select product_id from stock_transfer_items where transfer_id = p_transfer));
  for i in select * from stock_transfer_items where transfer_id = p_transfer order by product_id loop
    if i.product_id is null then
      raise exception 'unknown_item' using errcode = 'P0002', detail = jsonb_build_object('line', i.id)::text;
    end if;
    perform gd_saleable_out(p_shop, t.from_godown_id, i.product_id, i.quantity, 'transfer_dispatch', 'transfer', t.id, t.number, p_staff);
    perform gd_ledger(p_shop, i.product_id, i.product_name, t.to_godown_id, 'transit', i.quantity, 'transfer_dispatch', 'transfer', t.id, t.number, p_staff, null);
    update stock_transfer_items set dispatched = i.quantity where id = i.id;
  end loop;
  update stock_transfers
     set status = 'dispatched', dispatched_by = p_staff, dispatched_at = now(),
         requested_by = coalesce(requested_by, p_staff), requested_at = coalesce(requested_at, now())
   where id = p_transfer;
end;
$$;

-- Receipt at the destination: p_lines [{"item_id", "received", "damaged"}]. Received goods become
-- saleable there, damaged ones go to its damaged stock; the rest stays in transit (never assumed
-- received). The same p_client_ref twice posts once. Returns {"status", "duplicate"}.
create or replace function public.transfer_receive(p_shop uuid, p_transfer uuid, p_lines jsonb, p_staff uuid, p_client_ref text default null, p_note text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t stock_transfers;
  e jsonb;
  i stock_transfer_items;
  v_received numeric;
  v_damaged numeric;
  v_pending numeric;
  v_status text;
begin
  select * into t from stock_transfers where id = p_transfer and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_transfer' using errcode = 'P0002';
  end if;
  if p_client_ref is not null and exists (select 1 from stock_transfer_receipts where transfer_id = p_transfer and client_ref = p_client_ref) then
    return jsonb_build_object('status', t.status, 'duplicate', true);
  end if;
  if t.status not in ('dispatched', 'partially_received') then
    raise exception 'transfer_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', t.status, 'action', 'receive')::text;
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'invalid_receipt' using errcode = '22023', detail = 'at least one line is needed';
  end if;
  perform gd_godown(p_shop, t.to_godown_id);
  perform gd_lock_items(p_shop, array(select product_id from stock_transfer_items where transfer_id = p_transfer));
  for e in select * from jsonb_array_elements(p_lines) loop
    select * into i from stock_transfer_items where id = (e ->> 'item_id')::uuid and transfer_id = p_transfer for update;
    if not found then
      raise exception 'unknown_transfer_line' using errcode = 'P0002', detail = jsonb_build_object('item_id', e ->> 'item_id')::text;
    end if;
    v_received := coalesce((e ->> 'received')::numeric, 0);
    v_damaged := coalesce((e ->> 'damaged')::numeric, 0);
    if v_received < 0 or v_damaged < 0 then
      raise exception 'invalid_receipt' using errcode = '22023', detail = 'quantities cannot be negative';
    end if;
    v_pending := i.dispatched - i.received - i.damaged - i.shortage;
    if v_received + v_damaged > v_pending then
      raise exception 'receive_exceeds_pending' using errcode = 'P0001',
        detail = jsonb_build_object('item_id', i.id, 'name', i.product_name, 'pending', v_pending, 'asked', v_received + v_damaged)::text,
        hint = 'More than was sent arrived: record the extra as a stock difference at the destination.';
    end if;
    if v_received > 0 then
      perform gd_ledger(p_shop, i.product_id, i.product_name, t.to_godown_id, 'transit', -v_received, 'transfer_receive', 'transfer', t.id, t.number, p_staff, p_note);
      perform gd_saleable_in(p_shop, t.to_godown_id, i.product_id, v_received, 'transfer_receive', 'transfer', t.id, t.number, p_staff, p_note);
    end if;
    if v_damaged > 0 then
      perform gd_ledger(p_shop, i.product_id, i.product_name, t.to_godown_id, 'transit', -v_damaged, 'transfer_receive_damaged', 'transfer', t.id, t.number, p_staff, p_note);
      perform gd_damaged(p_shop, t.to_godown_id, i.product_id, v_damaged, 'transfer_receive_damaged', 'transfer', t.id, t.number, p_staff, p_note);
    end if;
    update stock_transfer_items set received = received + v_received, damaged = damaged + v_damaged where id = i.id;
  end loop;
  insert into stock_transfer_receipts (shop_id, transfer_id, client_ref, lines, received_by, note) values (p_shop, p_transfer, p_client_ref, p_lines, p_staff, p_note);
  v_status := case when exists (select 1 from stock_transfer_items where transfer_id = p_transfer and dispatched - received - damaged - shortage > 0) then 'partially_received' else 'received' end;
  update stock_transfers set status = v_status, received_by = p_staff, received_at = now() where id = p_transfer;
  return jsonb_build_object('status', v_status, 'duplicate', false);
end;
$$;

-- Close a transfer. Whatever never arrived becomes a transit shortage: it leaves transit for
-- "pending reconciliation" with a discrepancy record of its own (never silently dropped).
create or replace function public.transfer_close(p_shop uuid, p_transfer uuid, p_staff uuid, p_note text default null)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t stock_transfers;
  i record;
  v_short integer := 0;
  v_number text;
begin
  select * into t from stock_transfers where id = p_transfer and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_transfer' using errcode = 'P0002';
  end if;
  if t.status not in ('dispatched', 'partially_received', 'received') then
    raise exception 'transfer_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', t.status, 'action', 'close')::text;
  end if;
  for i in select *, dispatched - received - damaged - shortage as pending from stock_transfer_items where transfer_id = p_transfer order by product_id loop
    if i.pending > 0 then
      v_short := v_short + 1;
      v_number := next_godown_doc_number(p_shop, 'discrepancy', 'SD');
      insert into stock_discrepancies (shop_id, number, godown_id, product_id, product_name, kind, system_qty, physical_qty, difference, estimated_value, reason, transfer_id, reported_by)
      values (p_shop, v_number, t.to_godown_id, i.product_id, i.product_name, 'transit_shortage', i.pending, 0, -i.pending, round(i.pending * i.unit_value, 2),
              coalesce(p_note, 'Not received against transfer ' || t.number), t.id, p_staff);
      perform gd_ledger(p_shop, i.product_id, i.product_name, t.to_godown_id, 'transit', -i.pending, 'transfer_shortage', 'transfer', t.id, t.number, p_staff, p_note);
      perform gd_ledger(p_shop, i.product_id, i.product_name, t.to_godown_id, 'pending', i.pending, 'transfer_shortage', 'transfer', t.id, t.number, p_staff, p_note);
      update stock_transfer_items set shortage = shortage + i.pending where id = i.id;
    end if;
  end loop;
  update stock_transfers set status = 'closed', closed_by = p_staff, closed_at = now() where id = p_transfer;
  return v_short;
end;
$$;

-- ─── 10. Damage ────────────────────────────────────────────────────────────────
-- review / approve / reject. Approving takes the goods out of saleable stock into damaged stock at
-- the same godown (physical stock is unchanged until a write-off).
create or replace function public.damage_action(p_shop uuid, p_report uuid, p_action text, p_staff uuid, p_note text default null)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  d damage_reports;
begin
  select * into d from damage_reports where id = p_report and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_damage_report' using errcode = 'P0002';
  end if;
  if p_action = 'review' and d.status = 'reported' then
    update damage_reports set status = 'under_review', reviewed_by = p_staff, reviewed_at = now(), decision_note = coalesce(p_note, decision_note) where id = p_report;
    return 'under_review';
  elsif p_action = 'approve' and d.status in ('reported', 'under_review') then
    if d.product_id is null then
      raise exception 'unknown_item' using errcode = 'P0002';
    end if;
    perform gd_saleable_out(p_shop, d.godown_id, d.product_id, d.quantity, 'damage', 'damage', d.id, d.number, p_staff, p_note);
    perform gd_damaged(p_shop, d.godown_id, d.product_id, d.quantity, 'damage', 'damage', d.id, d.number, p_staff, p_note);
    update damage_reports set status = 'approved', approved_by = p_staff, approved_at = now(), decision_note = coalesce(p_note, decision_note) where id = p_report;
    return 'approved';
  elsif p_action = 'reject' and d.status in ('reported', 'under_review') then
    update damage_reports set status = 'rejected', rejected_by = p_staff, rejected_at = now(), decision_note = coalesce(p_note, decision_note) where id = p_report;
    return 'rejected';
  end if;
  raise exception 'damage_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', d.status, 'action', p_action)::text;
end;
$$;

-- What happens to approved damaged goods: repaired or sold at a discount → back to saleable stock;
-- scrapped → written off; kept as non-saleable; returned to the supplier → the goods leave with
-- the posted supplier return (purchase_return_post), so nothing moves here.
create or replace function public.damage_dispose(p_shop uuid, p_report uuid, p_disposition text, p_staff uuid, p_note text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  d damage_reports;
begin
  select * into d from damage_reports where id = p_report and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_damage_report' using errcode = 'P0002';
  end if;
  if d.status <> 'approved' then
    raise exception 'damage_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', d.status, 'action', 'dispose')::text;
  end if;
  if p_disposition in ('repair', 'discounted_sale') then
    perform gd_damaged(p_shop, d.godown_id, d.product_id, -d.quantity, 'damage_back_to_saleable', 'damage', d.id, d.number, p_staff, p_note);
    perform gd_saleable_in(p_shop, d.godown_id, d.product_id, d.quantity, 'damage_back_to_saleable', 'damage', d.id, d.number, p_staff, p_note);
  elsif p_disposition = 'scrap' then
    perform gd_damaged(p_shop, d.godown_id, d.product_id, -d.quantity, 'damage_writeoff', 'damage', d.id, d.number, p_staff, p_note);
  elsif p_disposition in ('non_saleable', 'return_to_supplier', 'other') then
    null;
  else
    raise exception 'invalid_disposition' using errcode = '22023', detail = p_disposition;
  end if;
  update damage_reports set status = 'dispositioned', disposition = p_disposition, dispositioned_by = p_staff, dispositioned_at = now(),
         decision_note = coalesce(p_note, decision_note)
   where id = p_report;
end;
$$;

-- ─── 11. Missing stock and discrepancies ───────────────────────────────────────
-- Reporting never moves stock. investigate → review → approve / reject → adjust → close. Adjusting
-- posts the difference at the godown (a transit shortage: written off, or found → received).
create or replace function public.discrepancy_action(p_shop uuid, p_id uuid, p_action text, p_staff uuid, p_note text default null, p_resolution text default null)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s stock_discrepancies;
  q numeric;
begin
  select * into s from stock_discrepancies where id = p_id and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_discrepancy' using errcode = 'P0002';
  end if;
  if p_action = 'investigate' and s.status = 'reported' then
    update stock_discrepancies set status = 'investigation', investigated_by = p_staff, investigated_at = now(),
           investigation_notes = coalesce(p_note, investigation_notes) where id = p_id;
    return 'investigation';
  elsif p_action = 'review' and s.status in ('reported', 'investigation') then
    update stock_discrepancies set status = 'reviewed', reviewed_by = p_staff, reviewed_at = now(),
           investigation_notes = coalesce(p_note, investigation_notes) where id = p_id;
    return 'reviewed';
  elsif p_action = 'approve' and s.status = 'reviewed' then
    update stock_discrepancies set status = 'approved', approved_by = p_staff, approved_at = now() where id = p_id;
    return 'approved';
  elsif p_action = 'reject' and s.status in ('reported', 'investigation', 'reviewed') then
    if s.kind = 'transit_shortage' then
      raise exception 'discrepancy_wrong_status' using errcode = 'P0001', hint = 'A transit shortage must be settled: written off or found.';
    end if;
    update stock_discrepancies set status = 'rejected', rejected_by = p_staff, rejected_at = now(),
           investigation_notes = coalesce(p_note, investigation_notes) where id = p_id;
    return 'rejected';
  elsif p_action = 'adjust' and s.status = 'approved' then
    if s.product_id is null then
      raise exception 'unknown_item' using errcode = 'P0002';
    end if;
    if s.kind = 'transit_shortage' then
      q := -s.difference;
      perform gd_ledger(p_shop, s.product_id, s.product_name, s.godown_id, 'pending', -q, 'shortage_settled', 'discrepancy', s.id, s.number, p_staff, p_note);
      if coalesce(p_resolution, 'written_off') in ('found', 'recovered') then
        perform gd_saleable_in(p_shop, s.godown_id, s.product_id, q, 'shortage_found', 'discrepancy', s.id, s.number, p_staff, p_note);
      end if;
    elsif s.difference < 0 then
      perform gd_saleable_out(p_shop, s.godown_id, s.product_id, -s.difference, 'discrepancy_adjust', 'discrepancy', s.id, s.number, p_staff, p_note);
    elsif s.difference > 0 then
      perform gd_saleable_in(p_shop, s.godown_id, s.product_id, s.difference, 'discrepancy_adjust', 'discrepancy', s.id, s.number, p_staff, p_note);
    end if;
    update stock_discrepancies set status = 'adjusted', adjusted_by = p_staff, adjusted_at = now(),
           resolution = coalesce(p_resolution, case when s.kind = 'transit_shortage' then 'written_off' else resolution end) where id = p_id;
    return 'adjusted';
  elsif p_action = 'close' and s.status in ('adjusted', 'rejected') then
    update stock_discrepancies set status = 'closed', closed_by = p_staff, closed_at = now() where id = p_id;
    return 'closed';
  end if;
  raise exception 'discrepancy_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', s.status, 'action', p_action)::text;
end;
$$;

-- ─── 12. Godown stock counts ───────────────────────────────────────────────────
-- Submitting keeps each item's system quantity at that moment beside the count; posting (after
-- approval) moves only the difference, so sales made meanwhile are kept.
create or replace function public.count_submit(p_shop uuid, p_count uuid, p_lines jsonb, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c godown_counts;
  e jsonb;
  p products;
begin
  select * into c from godown_counts where id = p_count and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_count' using errcode = 'P0002';
  end if;
  if c.status <> 'counting' then
    raise exception 'count_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', c.status, 'action', 'submit')::text;
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'invalid_count' using errcode = '22023', detail = 'at least one counted item is needed';
  end if;
  perform gd_godown(p_shop, c.godown_id);
  delete from godown_count_items where count_id = p_count;
  for e in select * from jsonb_array_elements(p_lines) loop
    p := gd_item(p_shop, (e ->> 'product_id')::uuid);
    if (e ->> 'physical')::numeric < 0 then
      raise exception 'invalid_count' using errcode = '22023', detail = 'a count cannot be negative';
    end if;
    insert into godown_count_items (count_id, shop_id, product_id, product_name, system_qty, physical_qty)
    values (p_count, p_shop, p.id, p.name, gd_available(p_shop, c.godown_id, p.id), (e ->> 'physical')::numeric);
  end loop;
  update godown_counts set status = 'submitted', submitted_by = p_staff, submitted_at = now() where id = p_count;
end;
$$;

create or replace function public.count_action(p_shop uuid, p_count uuid, p_action text, p_staff uuid, p_note text default null)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c godown_counts;
  i godown_count_items;
  v_diff numeric;
  v_kind text;
begin
  select * into c from godown_counts where id = p_count and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_count' using errcode = 'P0002';
  end if;
  if p_action = 'approve' and c.status = 'submitted' then
    update godown_counts set status = 'approved', approved_by = p_staff, approved_at = now(), note = coalesce(p_note, note) where id = p_count;
    return 'approved';
  elsif p_action = 'reject' and c.status = 'submitted' then
    update godown_counts set status = 'rejected', rejected_by = p_staff, rejected_at = now(), note = coalesce(p_note, note) where id = p_count;
    return 'rejected';
  elsif p_action = 'cancel' and c.status = 'counting' then
    update godown_counts set status = 'cancelled', note = coalesce(p_note, note) where id = p_count;
    return 'cancelled';
  elsif p_action = 'post' and c.status = 'approved' then
    v_kind := case when c.purpose = 'opening' then 'opening_adjust' else 'count_adjust' end;
    perform gd_lock_items(p_shop, array(select product_id from godown_count_items where count_id = p_count));
    for i in select * from godown_count_items where count_id = p_count order by product_id loop
      v_diff := i.physical_qty - i.system_qty;
      if v_diff < 0 then
        perform gd_saleable_out(p_shop, c.godown_id, i.product_id, -v_diff, v_kind, 'count', c.id, c.number, p_staff, p_note);
      elsif v_diff > 0 then
        perform gd_saleable_in(p_shop, c.godown_id, i.product_id, v_diff, v_kind, 'count', c.id, c.number, p_staff, p_note);
      end if;
      update godown_count_items set posted_difference = v_diff where id = i.id;
    end loop;
    update godown_counts set status = 'posted', posted_by = p_staff, posted_at = now() where id = p_count;
    return 'posted';
  end if;
  raise exception 'count_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', c.status, 'action', p_action)::text;
end;
$$;

-- ─── 13. Supplier returns ──────────────────────────────────────────────────────
-- Posts a draft return: each line no more than the purchase line brought in (bought + free) less
-- what earlier posted returns sent back; the goods leave the chosen godown (saleable, or damaged
-- stock for a line marked so); amounts from the line's rate and GST; the vendor is owed that much less.
create or replace function public.purchase_return_post(p_shop uuid, p_return uuid, p_staff uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r purchase_returns;
  l purchase_return_items;
  pi_row purchase_items;
  v_purchase_shop uuid;
  v_vendor uuid;
  v_eligible numeric;
  v_taxable numeric;
  v_gst numeric;
  v_sum_taxable numeric := 0;
  v_sum_gst numeric := 0;
begin
  select * into r from purchase_returns where id = p_return and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_purchase_return' using errcode = 'P0002';
  end if;
  if r.status <> 'draft' then
    raise exception 'purchase_return_wrong_status' using errcode = 'P0001', detail = jsonb_build_object('status', r.status)::text;
  end if;
  select shop_id, vendor_id into v_purchase_shop, v_vendor from purchases where id = r.purchase_id for update;
  if v_purchase_shop is distinct from p_shop or v_vendor is distinct from r.vendor_id then
    raise exception 'unknown_purchase' using errcode = 'P0002', hint = 'The purchase must be this shop''s, from the same vendor.';
  end if;
  perform gd_godown(p_shop, r.godown_id);
  if not exists (select 1 from purchase_return_items where return_id = p_return) then
    raise exception 'purchase_return_empty' using errcode = '22023';
  end if;
  perform gd_lock_items(p_shop, array(select product_id from purchase_return_items where return_id = p_return));
  for l in select * from purchase_return_items where return_id = p_return order by product_id loop
    select * into pi_row from purchase_items where id = l.purchase_item_id and purchase_id = r.purchase_id;
    if not found then
      raise exception 'unknown_purchase_line' using errcode = 'P0002', detail = jsonb_build_object('purchase_item_id', l.purchase_item_id)::text;
    end if;
    if l.product_id is null or l.product_id is distinct from pi_row.product_id then
      raise exception 'unknown_item' using errcode = 'P0002', detail = jsonb_build_object('purchase_item_id', l.purchase_item_id)::text;
    end if;
    v_eligible := pi_row.quantity + coalesce(pi_row.free_quantity, 0) - coalesce((
      select sum(x.quantity) from purchase_return_items x join purchase_returns y on y.id = x.return_id
       where x.purchase_item_id = l.purchase_item_id and y.status = 'posted'
    ), 0);
    if l.quantity > v_eligible then
      raise exception 'return_exceeds_purchase' using errcode = 'P0001',
        detail = jsonb_build_object('purchase_item_id', l.purchase_item_id, 'name', l.product_name, 'eligible', v_eligible, 'asked', l.quantity)::text;
    end if;
    if l.rate > pi_row.unit_price then
      raise exception 'return_rate_above_purchase' using errcode = 'P0001',
        detail = jsonb_build_object('purchase_item_id', l.purchase_item_id, 'rate', l.rate, 'purchase_rate', pi_row.unit_price)::text;
    end if;
    if l.from_damaged then
      perform gd_damaged(p_shop, r.godown_id, l.product_id, -l.quantity, 'purchase_return', 'purchase_return', r.id, r.number, p_staff, null);
      if l.damage_report_id is not null then
        update damage_reports set status = 'dispositioned', disposition = 'return_to_supplier', dispositioned_by = p_staff, dispositioned_at = now()
         where id = l.damage_report_id and shop_id = p_shop and status = 'approved';
      end if;
    else
      perform gd_saleable_out(p_shop, r.godown_id, l.product_id, l.quantity, 'purchase_return', 'purchase_return', r.id, r.number, p_staff, null);
    end if;
    v_taxable := round(l.quantity * l.rate, 2);
    v_gst := round(v_taxable * pi_row.gst_percent / 100, 2);
    update purchase_return_items set gst_percent = pi_row.gst_percent, taxable_value = v_taxable, gst_amount = v_gst, total = v_taxable + v_gst where id = l.id;
    v_sum_taxable := v_sum_taxable + v_taxable;
    v_sum_gst := v_sum_gst + v_gst;
  end loop;
  update purchase_returns
     set status = 'posted', posted_by = p_staff, posted_at = now(),
         taxable_value = v_sum_taxable, gst_amount = v_sum_gst, total = v_sum_taxable + v_sum_gst, credit_amount = v_sum_taxable + v_sum_gst
   where id = p_return;
  return jsonb_build_object('taxable', v_sum_taxable, 'gst', v_sum_gst, 'total', v_sum_taxable + v_sum_gst);
end;
$$;

-- What the shop owes each vendor: purchases' payable less payments (0039) and, from here, less
-- posted supplier returns.
create or replace function vendor_balances(p_shop_id uuid, p_vendor_ids uuid[] default null)
returns table (vendor_id uuid, balance numeric)
language sql
stable
as $$
  select y.vendor_id, sum(y.amount) as balance
  from (
    select pu.vendor_id, pu.payable_amount as amount
      from purchases pu
     where pu.shop_id = p_shop_id and pu.payable_amount <> 0
    union all
    select pp.vendor_id, -pp.amount
      from purchase_payments pp
     where pp.shop_id = p_shop_id
    union all
    select pr.vendor_id, -pr.credit_amount
      from purchase_returns pr
     where pr.shop_id = p_shop_id and pr.status = 'posted' and pr.credit_amount <> 0
  ) y
  where p_vendor_ids is null or y.vendor_id = any(p_vendor_ids)
  group by y.vendor_id;
$$;

-- ─── 14. Customer returns → godown ─────────────────────────────────────────────
-- A return (record_return) has already put its goods back on the default godown's shelf. Here each
-- returned line is placed: kept there, sent to another godown, or taken off saleable stock as
-- damaged / for inspection / for repair (with a damage report, to be repaired, scrapped or sent back).
create or replace function public.return_disposition_post(
  p_shop uuid, p_return_item uuid, p_qty numeric, p_disposition text, p_godown uuid, p_staff uuid, p_note text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ri return_items;
  v_return returns;
  v_default uuid := gd_default(p_shop);
  v_back numeric;
  v_done numeric;
  v_target uuid;
  v_id uuid;
  v_damage uuid;
  v_number text;
begin
  select * into ri from return_items where id = p_return_item for update;
  if not found then
    raise exception 'unknown_return_line' using errcode = 'P0002';
  end if;
  select * into v_return from returns where id = ri.return_id and shop_id = p_shop;
  if not found then
    raise exception 'unknown_return_line' using errcode = 'P0002';
  end if;
  if v_default is null then
    raise exception 'no_default_godown' using errcode = 'P0001', hint = 'Choose the shop floor (default godown) first.';
  end if;
  if ri.product_id is null then
    raise exception 'unknown_item' using errcode = 'P0002';
  end if;
  if p_qty <= 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  v_back := coalesce(ri.stock_back, ri.quantity);
  v_done := coalesce((select sum(quantity) from return_dispositions where return_item_id = p_return_item), 0);
  if p_qty > v_back - v_done then
    raise exception 'disposition_exceeds_return' using errcode = 'P0001',
      detail = jsonb_build_object('return_item_id', p_return_item, 'left', v_back - v_done, 'asked', p_qty)::text;
  end if;
  v_target := coalesce(p_godown, v_default);
  perform gd_item(p_shop, ri.product_id);
  if p_disposition = 'keep' then
    null;
  elsif p_disposition = 'to_godown' then
    if v_target = v_default then
      raise exception 'same_godown' using errcode = '22023';
    end if;
    perform gd_saleable_move(p_shop, v_default, v_target, ri.product_id, p_qty, 'customer_return', 'return', v_return.id, v_return.return_number, p_staff, p_note);
  elsif p_disposition in ('damaged', 'inspection', 'repair') then
    perform gd_godown(p_shop, v_target);
    v_number := next_godown_doc_number(p_shop, 'damage', 'DM');
    insert into damage_reports (shop_id, number, godown_id, product_id, product_name, quantity, reason, description, status, source_return_item_id, reported_by, approved_by, approved_at)
    values (p_shop, v_number, v_target, ri.product_id, ri.product_name, p_qty, 'customer_return_damage',
            coalesce(p_note, initcap(p_disposition) || ' — returned on ' || v_return.return_number), 'approved', p_return_item, p_staff, p_staff, now())
    returning id into v_damage;
    perform gd_saleable_out(p_shop, v_default, ri.product_id, p_qty, 'customer_return_damaged', 'return', v_return.id, v_return.return_number, p_staff, p_note);
    perform gd_damaged(p_shop, v_target, ri.product_id, p_qty, 'customer_return_damaged', 'damage', v_damage, v_number, p_staff, p_note);
  else
    raise exception 'invalid_disposition' using errcode = '22023', detail = p_disposition;
  end if;
  insert into return_dispositions (shop_id, return_id, return_item_id, product_id, product_name, quantity, disposition, godown_id, damage_report_id, note, staff_id)
  values (p_shop, v_return.id, p_return_item, ri.product_id, ri.product_name, p_qty, p_disposition, v_target, v_damage, p_note, p_staff)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── 15. Financial-year closing and carry forward ──────────────────────────────
-- A snapshot of stock as it stands now (run at the end of the year's last day): each godown's
-- saleable and damaged stock per item, stock in transit and transit shortages awaiting
-- reconciliation, valued at each item's latest purchase price. Once per shop and year.
create or replace function public.fy_close(p_shop uuid, p_fy text, p_closing_date date, p_staff uuid, p_note text default null)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_default uuid := gd_default(p_shop);
begin
  if v_default is null then
    raise exception 'no_default_godown' using errcode = 'P0001';
  end if;
  if exists (select 1 from fy_stock_closings where shop_id = p_shop and financial_year = p_fy) then
    raise exception 'year_already_closed' using errcode = '23505', detail = p_fy;
  end if;
  perform 1 from products where shop_id = p_shop order by id for update;
  insert into fy_stock_closings (shop_id, financial_year, closing_date, note, closed_by)
  values (p_shop, p_fy, p_closing_date, p_note, p_staff)
  returning id into v_id;

  with cost as (
    select distinct on (pi.product_id) pi.product_id, pi.unit_price
      from purchase_items pi join purchases pu on pu.id = pi.purchase_id
     where pu.shop_id = p_shop and pi.product_id is not null
     order by pi.product_id, pu.purchase_date desc, pu.created_at desc
  ),
  lines as (
    -- the default godown: the rest of each item's saleable total
    select p.id as product_id, v_default as godown_id, 'saleable'::text as bucket,
           p.stock_quantity - coalesce((select sum(gs.saleable) from godown_stock gs where gs.shop_id = p_shop and gs.product_id = p.id and gs.godown_id <> v_default), 0) as quantity,
           null::text as ref_type, null::uuid as ref_id
      from products p where p.shop_id = p_shop and p.track_inventory
    union all
    select gs.product_id, gs.godown_id, 'saleable', gs.saleable, null, null from godown_stock gs where gs.shop_id = p_shop and gs.godown_id <> v_default and gs.saleable <> 0
    union all
    select gs.product_id, gs.godown_id, 'damaged', gs.damaged, null, null from godown_stock gs where gs.shop_id = p_shop and gs.damaged <> 0
    union all
    select i.product_id, t.to_godown_id, 'transit', i.dispatched - i.received - i.damaged - i.shortage, 'transfer', t.id
      from stock_transfer_items i join stock_transfers t on t.id = i.transfer_id
     where t.shop_id = p_shop and t.status in ('dispatched', 'partially_received') and i.dispatched - i.received - i.damaged - i.shortage > 0
    union all
    select s.product_id, s.godown_id, 'pending', -s.difference, 'discrepancy', s.id
      from stock_discrepancies s
     where s.shop_id = p_shop and s.kind = 'transit_shortage' and s.status not in ('adjusted', 'closed', 'rejected')
  )
  insert into fy_stock_closing_lines (closing_id, shop_id, product_id, product_name, style_id, variant_colour, variant_size, sku, barcode, unit, godown_id, godown_name, bucket, quantity, unit_cost, value, ref_type, ref_id)
  select v_id, p_shop, l.product_id, p.name, p.style_id, p.variant_colour, p.variant_size, p.sku, p.barcode, p.unit, l.godown_id, g.name, l.bucket, l.quantity,
         coalesce(c.unit_price, 0), round(l.quantity * coalesce(c.unit_price, 0), 2), l.ref_type, l.ref_id
    from lines l
    join products p on p.id = l.product_id
    left join godowns g on g.id = l.godown_id
    left join cost c on c.product_id = l.product_id
   where l.quantity <> 0;

  update fy_stock_closings c
     set total_quantity = coalesce((select sum(quantity) from fy_stock_closing_lines where closing_id = v_id), 0),
         total_value = coalesce((select sum(value) from fy_stock_closing_lines where closing_id = v_id), 0),
         negative_lines = (select count(*) from fy_stock_closing_lines where closing_id = v_id and quantity < 0)
   where c.id = v_id;
  return v_id;
end;
$$;

-- Carry forward: the next year opens with the closing snapshot, written to the ledger as opening
-- balances that point back to it. No stock is created (the live balances simply continue), and a
-- year can be carried forward only once.
create or replace function public.fy_carry_forward(p_shop uuid, p_closing uuid, p_opening_date date, p_staff uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c fy_stock_closings;
  v_next text;
  l fy_stock_closing_lines;
begin
  select * into c from fy_stock_closings where id = p_closing and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_closing' using errcode = 'P0002';
  end if;
  if c.status <> 'closed' then
    raise exception 'already_carried_forward' using errcode = '23505', detail = c.financial_year;
  end if;
  v_next := (substr(c.financial_year, 1, 4)::int + 1)::text || '-' || lpad(((substr(c.financial_year, 1, 4)::int + 2) % 100)::text, 2, '0');
  for l in select * from fy_stock_closing_lines where closing_id = p_closing loop
    perform gd_ledger(p_shop, l.product_id, l.product_name, l.godown_id, l.bucket, l.quantity, 'opening_balance', 'fy_closing', c.id, c.financial_year, p_staff,
                      'Opening ' || v_next || ' from closing ' || c.financial_year);
  end loop;
  update fy_stock_closings set status = 'carried_forward', opening_financial_year = v_next, opening_date = p_opening_date, carried_by = p_staff, carried_at = now()
   where id = p_closing;
  return v_next;
end;
$$;

-- ─── 16. Access ────────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'next_godown_doc_number(uuid, text, text)',
    'gd_default(uuid)', 'gd_godown(uuid, uuid)', 'gd_item(uuid, uuid)', 'gd_available(uuid, uuid, uuid)',
    'gd_ledger(uuid, uuid, text, uuid, text, numeric, text, text, uuid, text, uuid, text)',
    'gd_saleable_out(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text)',
    'gd_saleable_in(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text)',
    'gd_saleable_move(uuid, uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text)',
    'gd_damaged(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text)',
    'gd_lock_items(uuid, uuid[])',
    'godown_set_default(uuid, uuid, uuid)',
    'godown_move_now(uuid, uuid, uuid, jsonb, text, uuid, text)',
    'transfer_action(uuid, uuid, text, uuid, text)',
    'transfer_dispatch(uuid, uuid, uuid)',
    'transfer_receive(uuid, uuid, jsonb, uuid, text, text)',
    'transfer_close(uuid, uuid, uuid, text)',
    'damage_action(uuid, uuid, text, uuid, text)',
    'damage_dispose(uuid, uuid, text, uuid, text)',
    'discrepancy_action(uuid, uuid, text, uuid, text, text)',
    'count_submit(uuid, uuid, jsonb, uuid)',
    'count_action(uuid, uuid, text, uuid, text)',
    'purchase_return_post(uuid, uuid, uuid)',
    'return_disposition_post(uuid, uuid, numeric, text, uuid, uuid, text)',
    'fy_close(uuid, text, date, uuid, text)',
    'fy_carry_forward(uuid, uuid, date, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

commit;

-- [rollback-start]
-- begin;
-- drop function if exists public.fy_carry_forward(uuid, uuid, date, uuid);
-- drop function if exists public.fy_close(uuid, text, date, uuid, text);
-- drop function if exists public.return_disposition_post(uuid, uuid, numeric, text, uuid, uuid, text);
-- drop function if exists public.purchase_return_post(uuid, uuid, uuid);
-- drop function if exists public.count_action(uuid, uuid, text, uuid, text);
-- drop function if exists public.count_submit(uuid, uuid, jsonb, uuid);
-- drop function if exists public.discrepancy_action(uuid, uuid, text, uuid, text, text);
-- drop function if exists public.damage_dispose(uuid, uuid, text, uuid, text);
-- drop function if exists public.damage_action(uuid, uuid, text, uuid, text);
-- drop function if exists public.transfer_close(uuid, uuid, uuid, text);
-- drop function if exists public.transfer_receive(uuid, uuid, jsonb, uuid, text, text);
-- drop function if exists public.transfer_dispatch(uuid, uuid, uuid);
-- drop function if exists public.transfer_action(uuid, uuid, text, uuid, text);
-- drop function if exists public.godown_move_now(uuid, uuid, uuid, jsonb, text, uuid, text);
-- drop function if exists public.godown_set_default(uuid, uuid, uuid);
-- drop function if exists public.gd_lock_items(uuid, uuid[]);
-- drop function if exists public.gd_damaged(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text);
-- drop function if exists public.gd_saleable_move(uuid, uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text);
-- drop function if exists public.gd_saleable_in(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text);
-- drop function if exists public.gd_saleable_out(uuid, uuid, uuid, numeric, text, text, uuid, text, uuid, text);
-- drop function if exists public.gd_ledger(uuid, uuid, text, uuid, text, numeric, text, text, uuid, text, uuid, text);
-- drop function if exists public.gd_available(uuid, uuid, uuid);
-- drop function if exists public.gd_item(uuid, uuid);
-- drop function if exists public.gd_godown(uuid, uuid);
-- drop function if exists public.gd_default(uuid);
-- drop function if exists public.next_godown_doc_number(uuid, text, text);
-- create or replace function vendor_balances(p_shop_id uuid, p_vendor_ids uuid[] default null)
-- returns table (vendor_id uuid, balance numeric)
-- language sql
-- stable
-- as $$
--   select y.vendor_id, sum(y.amount) as balance
--   from (
--     select pu.vendor_id, pu.payable_amount as amount
--       from purchases pu
--      where pu.shop_id = p_shop_id and pu.payable_amount <> 0
--     union all
--     select pp.vendor_id, -pp.amount
--       from purchase_payments pp
--      where pp.shop_id = p_shop_id
--   ) y
--   where p_vendor_ids is null or y.vendor_id = any(p_vendor_ids)
--   group by y.vendor_id;
-- $$;
-- drop table if exists fy_stock_closing_lines, fy_stock_closings, return_dispositions, purchase_return_items, purchase_returns,
--   godown_count_items, godown_counts, stock_discrepancies, damage_reports, stock_transfer_receipts, stock_transfer_items,
--   stock_transfers, godown_moves, godown_doc_counters, godown_stock, garment_settings, godowns;
-- drop trigger if exists trg_inventory_ledger_append_only on inventory_ledger;
-- drop table if exists inventory_ledger;
-- drop function if exists public.inventory_ledger_append_only();
-- drop index if exists uq_products_sku;
-- drop index if exists uq_products_style_variant;
-- drop index if exists idx_products_style;
-- alter table products drop column if exists sku, drop column if exists variant_size, drop column if exists variant_colour, drop column if exists style_id;
-- drop table if exists product_styles;
-- alter table shops drop constraint if exists shops_business_type_check;
-- alter table shops add constraint shops_business_type_check
--   check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'transport', 'service', 'salon', 'jewellery', 'clinic', 'gym', 'lab', 'hotel', 'wholesale', 'general'));
-- commit;
-- [rollback-end]
