-- Wholesale van sales: delivery vans as stock locations, a daily trip per van (load, bills on the
-- route, return, settlement), van-wise bill numbers, trip expenses and the settlement record; and
-- route tracking: shop map pins, location pings during a trip, and shop visits with their outcome.
--
-- Additive, and used only by wholesale shops' Van sales screens. Existing tables keep their rows and
-- meaning, and existing screens behave as before:
--   • godowns.kind's list gains 'vehicle', and godowns gains three nullable columns (vehicle_number,
--     default_staff_id, default_route);
--   • bills gains one nullable column, van_trip_id, set only on a bill made from a van.
-- Everything else is new tables and new functions.
--
-- How stock is kept: on 0063's godown ledger. A van is a godown of kind 'vehicle'. Loading moves
-- saleable stock from the shop's main godown to the van (gd_saleable_move); a bill from the van
-- takes the van's own stock in the same transaction as the bill's normal stock step
-- (take_bill_stock), so the main godown never feels it; a void puts it back on the van; settlement
-- writes off what is missing, sets damaged pieces aside in the main godown's damaged stock and moves
-- what came back to the main godown, after which the van holds nothing. Every movement is a row of
-- inventory_ledger, which can't be changed or deleted.
--
-- Only the server (service role) may call the functions. Run after 0060, 0061 and 0063.
-- Rollback: see the end of this file.

begin;

-- ─── 1. Vans are godowns ───────────────────────────────────────────────────────
alter table godowns drop constraint if exists godowns_kind_check;
alter table godowns add constraint godowns_kind_check
  check (kind in ('main', 'branch', 'shop_floor', 'warehouse', 'transit', 'vehicle'));
alter table godowns add column if not exists vehicle_number text;
alter table godowns add column if not exists default_staff_id uuid references staff(id) on delete set null;
alter table godowns add column if not exists default_route text;

-- ─── 2. Trips ───────────────────────────────────────────────────────────────
-- draft → loaded (on the route, billing) → returned (back, waiting for the count) → settled (locked).
create table if not exists van_trips (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  trip_number text not null,
  vehicle_id uuid not null references godowns(id) on delete cascade,
  source_godown_id uuid not null references godowns(id) on delete cascade,
  salesman_id uuid references staff(id) on delete set null,
  route text,
  status text not null default 'draft' check (status in ('draft', 'loaded', 'returned', 'settled', 'cancelled')),
  opening_cash numeric(12, 2) not null default 0 check (opening_cash >= 0),
  loaded_at timestamptz,
  loaded_by uuid,
  returned_at timestamptz,
  returned_by uuid,
  settled_at timestamptz,
  settled_by uuid,
  -- The money at settlement: what the trip should hand over and what it did.
  cash_expected numeric(12, 2),
  cash_handed numeric(12, 2),
  upi_expected numeric(12, 2),
  upi_received numeric(12, 2),
  shortage_value numeric(12, 2),
  salesman_charge numeric(12, 2) not null default 0 check (salesman_charge >= 0),
  settle_note text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_van_trips_number on van_trips(shop_id, trip_number);
-- One open trip per van at a time.
create unique index if not exists uq_van_trips_open on van_trips(vehicle_id) where status in ('draft', 'loaded', 'returned');
create index if not exists idx_van_trips_shop_time on van_trips(shop_id, created_at desc);
alter table van_trips enable row level security;

-- The count at settlement, one row per item: what went out, what was sold, what should have come
-- back and what did.
create table if not exists van_trip_lines (
  trip_id uuid not null references van_trips(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  loaded numeric(12, 3) not null default 0,
  sold numeric(12, 3) not null default 0,
  expected numeric(12, 3) not null default 0,
  counted numeric(12, 3) not null default 0,
  damaged numeric(12, 3) not null default 0,
  shortage numeric(12, 3) not null default 0,
  excess numeric(12, 3) not null default 0,
  primary key (trip_id, product_id)
);
alter table van_trip_lines enable row level security;

create table if not exists van_expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  trip_id uuid not null references van_trips(id) on delete cascade,
  kind text not null check (kind in ('diesel', 'toll', 'labour', 'food', 'repair', 'other')),
  amount numeric(12, 2) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 200),
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_van_expenses_trip on van_expenses(trip_id);
alter table van_expenses enable row level security;

-- A bill made from a van.
alter table bills add column if not exists van_trip_id uuid references van_trips(id) on delete set null;
create index if not exists idx_bills_van_trip on bills(van_trip_id) where van_trip_id is not null;

-- ─── 2b. Route tracking: shop pins, location pings and shop visits ──────────────────
-- A shop's map pin is kept here, not on customers, so no other trade's customer table changes.
-- Locations are recorded only during a trip that is on the route.
create table if not exists van_shop_locations (
  customer_id uuid primary key references customers(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  verified boolean not null default false,
  radius_m integer not null default 150 check (radius_m between 20 and 2000),
  set_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists idx_van_shop_locations_shop on van_shop_locations(shop_id);
alter table van_shop_locations enable row level security;

create table if not exists van_pings (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  trip_id uuid not null references van_trips(id) on delete cascade,
  staff_id uuid,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  accuracy_m numeric(8, 1),
  speed numeric(8, 2),
  source text not null default 'auto' check (source in ('auto', 'bill', 'checkin', 'start', 'end')),
  bill_id uuid,
  at timestamptz not null default now()
);
create index if not exists idx_van_pings_trip on van_pings(trip_id, at);
alter table van_pings enable row level security;

create table if not exists van_visits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  trip_id uuid not null references van_trips(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_m numeric(8, 1),
  distance_m integer,
  verified boolean,
  outcome text not null check (outcome in ('billed', 'collection_only', 'no_order', 'shop_closed', 'owner_absent', 'other')),
  note text check (note is null or char_length(note) <= 200),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_van_visits_trip on van_visits(trip_id, check_in_at);
create index if not exists idx_van_visits_customer on van_visits(shop_id, customer_id, check_in_at desc);
alter table van_visits enable row level security;

-- ─── 3. Functions ───────────────────────────────────────────────────────────

-- The trip, locked, if it is this shop's.
create or replace function public.van_trip(p_shop uuid, p_trip uuid)
returns van_trips
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips;
begin
  select * into t from van_trips where id = p_trip and shop_id = p_shop for update;
  if not found then
    raise exception 'unknown_trip' using errcode = 'P0002';
  end if;
  return t;
end;
$$;

-- A new trip for a van: 'V1-20261106-01'. Refused while the van has a trip open.
create or replace function public.van_trip_new(p_shop uuid, p_vehicle uuid, p_source uuid, p_salesman uuid, p_route text, p_opening_cash numeric, p_staff uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v godowns;
  s godowns;
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_n integer;
  v_id uuid;
begin
  select * into v from godowns where id = p_vehicle and shop_id = p_shop for update;
  if not found or v.kind <> 'vehicle' then
    raise exception 'unknown_vehicle' using errcode = 'P0002';
  end if;
  if not v.is_active then
    raise exception 'inactive_godown' using errcode = 'P0001', detail = jsonb_build_object('godown_id', p_vehicle, 'name', v.name)::text;
  end if;
  s := gd_godown(p_shop, p_source);
  if s.kind = 'vehicle' then
    raise exception 'source_is_vehicle' using errcode = '22023';
  end if;
  if exists (select 1 from van_trips where vehicle_id = p_vehicle and status in ('draft', 'loaded', 'returned')) then
    raise exception 'vehicle_busy' using errcode = 'P0001', detail = jsonb_build_object('name', v.name)::text;
  end if;
  if p_salesman is not null and not exists (select 1 from staff where id = p_salesman and shop_id = p_shop) then
    raise exception 'unknown_staff' using errcode = 'P0002';
  end if;
  select count(*) + 1 into v_n from van_trips
   where vehicle_id = p_vehicle and (created_at at time zone 'Asia/Kolkata')::date = v_day;
  insert into van_trips (shop_id, trip_number, vehicle_id, source_godown_id, salesman_id, route, opening_cash, created_by)
  values (p_shop, v.code || '-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad(v_n::text, 2, '0'), p_vehicle, p_source, p_salesman,
          nullif(trim(coalesce(p_route, '')), ''), greatest(coalesce(p_opening_cash, 0), 0), p_staff)
  returning id into v_id;
  return v_id;
end;
$$;

-- Goods go onto the van from the trip's godown: the first load (draft → loaded) or a top-up during
-- the day. All the lines or none.
create or replace function public.van_trip_load(p_shop uuid, p_trip uuid, p_lines jsonb, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
  v_kind text;
  l record;
begin
  if t.status not in ('draft', 'loaded') then
    raise exception 'trip_closed' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no_lines' using errcode = '22023';
  end if;
  v_kind := case when t.status = 'draft' then 'van_load' else 'van_topup' end;
  perform gd_lock_items(p_shop, array(select (e ->> 'product_id')::uuid from jsonb_array_elements(p_lines) e));
  for l in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::numeric) as quantity
      from jsonb_array_elements(p_lines) e
     group by 1
  loop
    if l.quantity is null or l.quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    perform gd_saleable_move(p_shop, t.source_godown_id, t.vehicle_id, l.product_id, l.quantity, v_kind, 'van_trip', t.id, t.trip_number, p_staff, null);
  end loop;
  if t.status = 'draft' then
    update van_trips set status = 'loaded', loaded_at = now(), loaded_by = p_staff where id = t.id;
  end if;
end;
$$;

-- A bill from the van: the van's own stock comes off, then the bill's normal stock step runs, in one
-- transaction. More than the van holds is refused, whatever the shop's other stock is.
create or replace function public.van_take_bill_stock(p_shop_id uuid, p_trip_id uuid, p_bill_id uuid, p_lines jsonb, p_dishes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop_id, p_trip_id);
  v_invoice text;
  v_have numeric;
  l record;
begin
  if t.status <> 'loaded' then
    raise exception 'trip_not_on_route' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  select invoice_number into v_invoice from bills where id = p_bill_id and shop_id = p_shop_id and van_trip_id = p_trip_id and status = 'active';
  if not found then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'bill not found on this trip';
  end if;
  perform gd_lock_items(p_shop_id, array(
    select bi.product_id from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
  ));
  for l in
    select bi.product_id, p.name, sum((e ->> 'quantity')::numeric) as quantity
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
      join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
      join products p on p.id = bi.product_id and p.shop_id = p_shop_id
     where (e ->> 'quantity')::numeric > 0
     group by bi.product_id, p.name
  loop
    select saleable into v_have from godown_stock where godown_id = t.vehicle_id and product_id = l.product_id for update;
    if coalesce(v_have, 0) < l.quantity then
      raise exception 'insufficient_vehicle_stock' using errcode = 'P0001',
        detail = jsonb_build_object('product_id', l.product_id, 'name', l.name, 'requested', l.quantity, 'available', coalesce(v_have, 0))::text;
    end if;
    update godown_stock set saleable = saleable - l.quantity, updated_at = now() where godown_id = t.vehicle_id and product_id = l.product_id;
    perform gd_ledger(p_shop_id, l.product_id, l.name, t.vehicle_id, 'saleable', -l.quantity, 'van_sale', 'bill', p_bill_id, v_invoice, null, t.trip_number);
  end loop;
  return take_bill_stock(p_shop_id, p_bill_id, p_lines, false, coalesce(p_dishes, '[]'::jsonb));
end;
$$;

-- Voiding a van bill: the bill's normal void, then what it took from the van goes back onto the van.
-- Refused once the trip is settled.
create or replace function public.van_void_bill_stock(p_shop_id uuid, p_bill_id uuid, p_staff_id uuid, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_trip uuid;
  t van_trips;
  v_invoice text;
  v_result jsonb;
  l record;
begin
  select van_trip_id, invoice_number into v_trip, v_invoice from bills where id = p_bill_id and shop_id = p_shop_id for update;
  if v_trip is null then
    return void_bill_stock(p_shop_id, p_bill_id, p_staff_id, p_reason, p_lines);
  end if;
  t := van_trip(p_shop_id, v_trip);
  if t.status not in ('loaded', 'returned') then
    raise exception 'trip_settled' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  v_result := void_bill_stock(p_shop_id, p_bill_id, p_staff_id, p_reason, p_lines);
  if v_result ->> 'result' in ('already_voided', 'has_credit_adjustment') then
    return v_result;
  end if;
  for l in
    select product_id, max(product_name) as name, -sum(quantity) as quantity
      from inventory_ledger
     where shop_id = p_shop_id and ref_type = 'bill' and ref_id = p_bill_id and godown_id = t.vehicle_id and kind in ('van_sale', 'van_sale_back')
     group by product_id
    having -sum(quantity) > 0
  loop
    insert into godown_stock (shop_id, godown_id, product_id, saleable) values (p_shop_id, t.vehicle_id, l.product_id, l.quantity)
    on conflict (godown_id, product_id) do update set saleable = godown_stock.saleable + excluded.saleable, updated_at = now();
    perform gd_ledger(p_shop_id, l.product_id, l.name, t.vehicle_id, 'saleable', l.quantity, 'van_sale_back', 'bill', p_bill_id, v_invoice, p_staff_id, t.trip_number);
  end loop;
  return v_result;
end;
$$;

-- The van is back: billing on the trip stops, and it waits for the count.
create or replace function public.van_trip_return(p_shop uuid, p_trip uuid, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
begin
  if t.status <> 'loaded' then
    raise exception 'trip_not_on_route' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  update van_trips set status = 'returned', returned_at = now(), returned_by = p_staff where id = t.id;
end;
$$;

-- A trip that was never loaded is cancelled rather than left open.
create or replace function public.van_trip_cancel(p_shop uuid, p_trip uuid, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
begin
  if t.status <> 'draft' then
    raise exception 'trip_loaded' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  update van_trips set status = 'cancelled', settled_at = now(), settled_by = p_staff where id = t.id;
end;
$$;

-- Settlement. p_lines: every item the van holds, { product_id, counted, damaged } — counted is the
-- good pieces back, damaged the broken ones. What is missing is written off (a shortage), extra
-- pieces are taken in, damaged ones go to the trip godown's damaged stock, and the good ones go back
-- to the trip godown. Afterwards the van holds nothing. p_money: the cash and UPI figures the screen
-- worked out and what was handed over, recorded with the trip.
create or replace function public.van_trip_settle(p_shop uuid, p_trip uuid, p_lines jsonb, p_money jsonb, p_staff uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
  v_line jsonb;
  v_counted numeric;
  v_damaged numeric;
  v_expected numeric;
  v_short numeric;
  v_excess numeric;
  v_loaded numeric;
  v_sold numeric;
  r record;
begin
  if t.status not in ('loaded', 'returned') then
    raise exception 'trip_not_open' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  -- Every item on the van must be counted; a count for an item that isn't there is refused too.
  if exists (
    select 1 from godown_stock gs
     where gs.godown_id = t.vehicle_id and gs.saleable > 0
       and not exists (select 1 from jsonb_array_elements(p_lines) e where (e ->> 'product_id')::uuid = gs.product_id)
  ) then
    raise exception 'count_missing' using errcode = 'P0001';
  end if;
  perform gd_lock_items(p_shop, array(select gs.product_id from godown_stock gs where gs.godown_id = t.vehicle_id and gs.saleable > 0));
  for r in
    select gs.product_id, p.name, gs.saleable as expected
      from godown_stock gs join products p on p.id = gs.product_id
     where gs.godown_id = t.vehicle_id and gs.saleable > 0
     union
    select (e ->> 'product_id')::uuid, p.name, 0
      from jsonb_array_elements(p_lines) e join products p on p.id = (e ->> 'product_id')::uuid and p.shop_id = p_shop
     where not exists (select 1 from godown_stock gs where gs.godown_id = t.vehicle_id and gs.product_id = (e ->> 'product_id')::uuid and gs.saleable > 0)
  loop
    select e into v_line from jsonb_array_elements(p_lines) e where (e ->> 'product_id')::uuid = r.product_id limit 1;
    v_counted := coalesce((v_line ->> 'counted')::numeric, 0);
    v_damaged := coalesce((v_line ->> 'damaged')::numeric, 0);
    if v_counted < 0 or v_damaged < 0 then
      raise exception 'invalid_count' using errcode = '22023';
    end if;
    v_expected := r.expected;
    v_short := greatest(v_expected - v_counted - v_damaged, 0);
    v_excess := greatest(v_counted + v_damaged - v_expected, 0);
    if v_excess > 0 then
      perform gd_saleable_in(p_shop, t.vehicle_id, r.product_id, v_excess, 'van_excess', 'van_trip', t.id, t.trip_number, p_staff, 'Found more at settlement');
    end if;
    if v_short > 0 then
      perform gd_saleable_out(p_shop, t.vehicle_id, r.product_id, v_short, 'van_shortage', 'van_trip', t.id, t.trip_number, p_staff, 'Missing at settlement');
    end if;
    if v_damaged > 0 then
      perform gd_saleable_out(p_shop, t.vehicle_id, r.product_id, v_damaged, 'van_damage', 'van_trip', t.id, t.trip_number, p_staff, 'Damaged on the trip');
      perform gd_damaged(p_shop, t.source_godown_id, r.product_id, v_damaged, 'van_damage', 'van_trip', t.id, t.trip_number, p_staff, 'Damaged on the trip');
    end if;
    if v_counted > 0 then
      perform gd_saleable_move(p_shop, t.vehicle_id, t.source_godown_id, r.product_id, v_counted, 'van_unload', 'van_trip', t.id, t.trip_number, p_staff, null);
    end if;
    select coalesce(sum(quantity) filter (where kind in ('van_load', 'van_topup')), 0),
           coalesce(-sum(quantity) filter (where kind in ('van_sale', 'van_sale_back')), 0)
      into v_loaded, v_sold
      from inventory_ledger
     where shop_id = p_shop and product_id = r.product_id and godown_id = t.vehicle_id
       and ((ref_type = 'van_trip' and ref_id = t.id) or (ref_type = 'bill' and note = t.trip_number));
    insert into van_trip_lines (trip_id, shop_id, product_id, product_name, loaded, sold, expected, counted, damaged, shortage, excess)
    values (t.id, p_shop, r.product_id, r.name, v_loaded, v_sold, v_expected, v_counted, v_damaged, v_short, v_excess);
  end loop;
  if exists (select 1 from godown_stock where godown_id = t.vehicle_id and saleable <> 0) then
    raise exception 'vehicle_not_empty' using errcode = 'P0001';
  end if;
  update van_trips set
    status = 'settled', settled_at = now(), settled_by = p_staff,
    returned_at = coalesce(returned_at, now()), returned_by = coalesce(returned_by, p_staff),
    cash_expected = (p_money ->> 'cash_expected')::numeric,
    cash_handed = (p_money ->> 'cash_handed')::numeric,
    upi_expected = (p_money ->> 'upi_expected')::numeric,
    upi_received = (p_money ->> 'upi_received')::numeric,
    shortage_value = (p_money ->> 'shortage_value')::numeric,
    salesman_charge = greatest(coalesce((p_money ->> 'salesman_charge')::numeric, 0), 0),
    settle_note = nullif(trim(coalesce(p_money ->> 'note', '')), '')
  where id = t.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'van_trip(uuid, uuid)',
    'van_trip_new(uuid, uuid, uuid, uuid, text, numeric, uuid)',
    'van_trip_load(uuid, uuid, jsonb, uuid)',
    'van_take_bill_stock(uuid, uuid, uuid, jsonb, jsonb)',
    'van_void_bill_stock(uuid, uuid, uuid, text, jsonb)',
    'van_trip_return(uuid, uuid, uuid)',
    'van_trip_cancel(uuid, uuid, uuid)',
    'van_trip_settle(uuid, uuid, jsonb, jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

commit;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- Only if no van has been used; a trip's stock moves stay in inventory_ledger either way.
-- begin;
-- drop function if exists public.van_trip_settle(uuid, uuid, jsonb, jsonb, uuid);
-- drop function if exists public.van_trip_cancel(uuid, uuid, uuid);
-- drop function if exists public.van_trip_return(uuid, uuid, uuid);
-- drop function if exists public.van_void_bill_stock(uuid, uuid, uuid, text, jsonb);
-- drop function if exists public.van_take_bill_stock(uuid, uuid, uuid, jsonb, jsonb);
-- drop function if exists public.van_trip_load(uuid, uuid, jsonb, uuid);
-- drop function if exists public.van_trip_new(uuid, uuid, uuid, uuid, text, numeric, uuid);
-- drop function if exists public.van_trip(uuid, uuid);
-- alter table bills drop column if exists van_trip_id;
-- drop table if exists van_visits, van_pings, van_shop_locations, van_expenses, van_trip_lines, van_trips;
-- alter table godowns drop column if exists default_route, drop column if exists default_staff_id, drop column if exists vehicle_number;
-- alter table godowns drop constraint if exists godowns_kind_check;
-- alter table godowns add constraint godowns_kind_check check (kind in ('main', 'branch', 'shop_floor', 'warehouse', 'transit'));
-- commit;
