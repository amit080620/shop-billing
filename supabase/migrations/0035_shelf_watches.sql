-- "Ankhon se Inventory" — photo-based shelf watching. Each row is one
-- named shelf/section a shop owner photographs periodically; the
-- photo_url is always the MOST RECENT photo, so the next upload has
-- something to compare against.
create table if not exists shelf_watches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  photo_url text,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists shelf_watches_shop_id_idx on shelf_watches(shop_id);

alter table shelf_watches enable row level security;
