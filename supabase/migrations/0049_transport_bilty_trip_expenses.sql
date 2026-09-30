-- Transport: the bilty (lorry receipt, LR) and what a trip costs.
--
-- A. Bilty / LR. Every consignment carried gets a numbered LR (LR/2026-27/00001): who sends it
--    (consignor) and who receives it (consignee), from where to where, the goods, packages and
--    weight, the freight — and who pays it: "paid" (the sender, at booking), "to pay" (the
--    receiver, on delivery) or "to be billed" (a regular party, billed later, often monthly).
--    It moves booked → on the way → delivered (with who received it); the freight becomes an
--    ordinary bill (one LR, or several for the same party), so udhaar, GST and the Daily summary
--    work as for any sale.
--
-- B. Trip expenses. Diesel (litres and the odometer reading, for the vehicle's average), toll,
--    the driver's bhatta, loading, repairs, tyres… each against a vehicle and, if it belongs to
--    one, an LR. Money paid out counts in the Daily summary on the day it is paid. Earnings minus
--    these give each vehicle's real profit.

-- A ─────────────────────────────────────────────────────────────────────
create table if not exists lr_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table lr_counters enable row level security;

create or replace function next_lr_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into lr_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = lr_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;
revoke all on function next_lr_number(uuid, text) from public, anon, authenticated;
grant execute on function next_lr_number(uuid, text) to service_role;

create table if not exists consignments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  lr_number text not null,
  lr_date date not null,
  vehicle_id uuid references vehicles(id) on delete set null,
  vehicle_number text,                        -- also for a hired vehicle not in the fleet
  driver_name text,
  driver_phone text,
  consignor_customer_id uuid references customers(id) on delete set null,
  consignor_name text not null,
  consignor_phone text,
  consignor_gstin text,
  consignor_address text,
  consignee_customer_id uuid references customers(id) on delete set null,
  consignee_name text not null,
  consignee_phone text,
  consignee_gstin text,
  consignee_address text,
  from_place text not null,
  to_place text not null,
  goods text not null,
  packages integer,
  packing text,
  actual_weight numeric(12, 3),
  charged_weight numeric(12, 3),
  weight_unit text not null default 'KG',
  declared_value numeric(14, 2),
  invoice_ref text,                           -- the sender's invoice number
  eway_bill_no text,
  freight numeric(12, 2) not null check (freight >= 0),
  other_charges numeric(12, 2) not null default 0 check (other_charges >= 0),
  pay_by text not null default 'to_pay' check (pay_by in ('paid', 'to_pay', 'tbb')),
  status text not null default 'booked' check (status in ('booked', 'in_transit', 'delivered', 'cancelled')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  received_by text,
  delivery_note text,
  bill_id uuid references bills(id) on delete set null,
  notes text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_consignments_lr on consignments (shop_id, lr_number);
create index if not exists idx_consignments_shop_date on consignments (shop_id, lr_date);
create index if not exists idx_consignments_bill on consignments (bill_id);

-- B ─────────────────────────────────────────────────────────────────────
create table if not exists trip_expenses (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  consignment_id uuid references consignments(id) on delete set null,
  expense_date date not null,
  category text not null check (category in ('diesel', 'toll', 'driver', 'loading', 'repair', 'tyre', 'police', 'other')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  litres numeric(10, 2),
  odometer_km numeric(12, 1),
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_trip_expenses_shop_date on trip_expenses (shop_id, expense_date);
create index if not exists idx_trip_expenses_vehicle on trip_expenses (vehicle_id, expense_date);

-- Read and written only by the server (service role), like every other money table.
alter table consignments enable row level security;
alter table trip_expenses enable row level security;
