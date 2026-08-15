-- ============================================================
-- THE RAY BILL — सभी बाकी SQL migrations एक साथ
-- Supabase Dashboard → SQL Editor में पूरा paste करके Run करें
-- (safe to re-run — सभी statements "if not exists" वाले हैं)
-- ============================================================

-- 1) Restaurant order timestamps (sent_to_kitchen_at, first_ready_at, served_at)
alter table restaurant_orders add column if not exists sent_to_kitchen_at timestamptz;
alter table restaurant_orders add column if not exists first_ready_at timestamptz;
alter table restaurant_orders add column if not exists served_at timestamptz;

-- 2) Table I/O/T categorization (Inside / Outside / Takeaway)
alter table restaurant_tables add column if not exists section text
  check (section in ('inside', 'outside', 'takeaway'));

-- 3) Item modifiers/options (Thali -> Beverage -> Lassi/Chaas)
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

-- ============================================================
-- यहाँ तक — Done. सभी 3 migrations (0001, 0002, 0003) cover हो गईं।
-- ============================================================
