-- One pre-computed briefing per shop per day, filled in overnight by
-- a Vercel Cron job so the assistant can show it INSTANTLY the first
-- time it's opened that day, instead of computing it live (and making
-- the person wait for an AI call) at open time.
create table if not exists daily_briefings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  briefing_date date not null,
  message text,
  overdue_count int not null default 0,
  low_stock_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, briefing_date)
);

create index if not exists daily_briefings_shop_date_idx on daily_briefings(shop_id, briefing_date);

alter table daily_briefings enable row level security;
