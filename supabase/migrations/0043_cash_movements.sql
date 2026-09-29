-- Money that moves outside a bill: advances and their refunds.
--
-- The daily summary is meant to match the cash drawer, but some money never passed through a bill
-- on the day it changed hands: the advance a repair shop takes when a phone comes in, the token
-- a restaurant takes for a table booking, and the money handed back when a booking or a rental is
-- cancelled. Each of those is one row here, on the day it happened, with how it was paid:
--
--   advance_received  + money in   (the day the advance was taken)
--   advance_applied   − not new    (the day the final bill counts that advance again as "paid",
--                                   so the summary does not count it twice)
--   refund_given      − money out  (a token or a cancelled rental's money handed back)
--
-- Signed amounts, so the day's figure for a method is simply the sum of its rows.

create table if not exists cash_movements (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null check (kind in ('advance_received', 'advance_applied', 'refund_given')),
  source text not null check (source in ('service_job', 'reservation', 'rental', 'item_request')),
  source_id uuid,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  amount numeric(12, 2) not null,
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_movements_shop_day on cash_movements (shop_id, created_at);
create index if not exists idx_cash_movements_source on cash_movements (source, source_id);

-- Read and written only by the server (service role), like every other money table.
alter table cash_movements enable row level security;
