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
