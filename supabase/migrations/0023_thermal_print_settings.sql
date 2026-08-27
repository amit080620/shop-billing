-- Genuinely separate thermal-print formatting settings per paper
-- width (58mm vs 80mm) — a Bluetooth thermal printer renders its own
-- text (no CSS/HTML involved), so this is what gives the owner real
-- control over exactly how the shop name, item table, and total line
-- look on the actual printed receipt.
create table if not exists thermal_print_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  -- 58mm settings
  t58_shop_name_bold boolean not null default true,
  t58_shop_name_large boolean not null default true,
  t58_items_bold boolean not null default false,
  t58_total_bold boolean not null default true,
  t58_total_large boolean not null default true,
  -- 80mm settings
  t80_shop_name_bold boolean not null default true,
  t80_shop_name_large boolean not null default true,
  t80_items_bold boolean not null default false,
  t80_total_bold boolean not null default true,
  t80_total_large boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table thermal_print_settings enable row level security;
