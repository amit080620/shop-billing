-- Wholesale van sales, part two (after 0066): bill numbers kept for each trip so a salesman can bill
-- with no internet, shop returns going back onto the van, a discount limit per van, photos of trip
-- expenses and shop visits, check-ins saved on the phone while offline, a key for the Android app's
-- background tracking, and a van shortage taken off the salesman's salary.
--
-- Additive, and used only by wholesale shops' Van sales. Existing rows keep their meaning and existing
-- screens behave as before:
--   • new nullable columns on van_trips, van_trip_lines (returned, default 0), van_expenses,
--     van_visits, godowns (read only for vans) and returns (set only on a return made from a van);
--   • one new table, van_bill_numbers;
--   • worker_payments' kind list gains 'deduction', written only when an owner settles a van trip and
--     ticks "take it off the salary";
--   • van_take_bill_stock and van_trip_settle are replaced: a bill made offline on the route may still
--     reach a trip that has come back but isn't settled, and settlement also records shop returns,
--     gives the trip's unused bill numbers back to the van's series and can post the salary deduction.
-- Everything else is new functions.
--
-- Only the server (service role) may call the functions. Run after 0066.
-- Rollback: see the end of this file.

begin;

-- ─── 1. Bill numbers kept for a trip ──────────────────────────────────────────
-- A trip keeps a block of its van's bill numbers (number_from..number_to under number_prefix, e.g.
-- 'V1/2026-27/'). The salesman's phone knows the block, so a bill made with no internet already has
-- its final number. van_bill_numbers holds every number handed out, so none is used twice; at
-- settlement the numbers the trip never used go back to the van's series, which stays gap-free.
alter table van_trips add column if not exists number_prefix text;
alter table van_trips add column if not exists number_from integer;
alter table van_trips add column if not exists number_to integer;
-- The Android app's background tracking: a random key, kept here only as its SHA-256.
alter table van_trips add column if not exists ping_token_hash text;
-- The salary deduction a settlement posted, if any.
alter table van_trips add column if not exists salary_deduction_id uuid;

create table if not exists van_bill_numbers (
  trip_id uuid not null references van_trips(id) on delete cascade,
  prefix text not null,
  n integer not null check (n > 0),
  created_at timestamptz not null default now(),
  primary key (trip_id, prefix, n)
);
alter table van_bill_numbers enable row level security;

-- ─── 2. Shop returns onto the van, discount limit, photos, offline check-ins ─────────
alter table returns add column if not exists van_trip_id uuid references van_trips(id) on delete set null;
create index if not exists idx_returns_van_trip on returns(van_trip_id) where van_trip_id is not null;
alter table van_trip_lines add column if not exists returned numeric(12, 3) not null default 0;

-- The most a salesman may take off a van bill, as a % of the rate list. Null: no limit.
alter table godowns add column if not exists van_max_discount numeric(5, 2);
alter table godowns drop constraint if exists godowns_van_max_discount_check;
alter table godowns add constraint godowns_van_max_discount_check check (van_max_discount is null or (van_max_discount >= 0 and van_max_discount <= 100));

-- A photo's path in the private 'van-photos' storage bucket.
alter table van_expenses add column if not exists photo_path text;
alter table van_visits add column if not exists photo_path text;
-- A check-in made on the phone with no internet carries the phone's own id, so a retried sync saves it once.
alter table van_visits add column if not exists client_ref text;
create unique index if not exists uq_van_visits_client_ref on van_visits(trip_id, client_ref) where client_ref is not null;

-- ─── 3. Salary deduction ──────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.worker_payments') is not null then
    alter table worker_payments drop constraint if exists worker_payments_kind_check;
    alter table worker_payments add constraint worker_payments_kind_check check (kind in ('advance', 'salary', 'bonus', 'deduction'));
  end if;
end;
$$;

-- ─── 4. Functions ─────────────────────────────────────────────────────────────

-- Today's financial year (April–March, India), written as next_godown_doc_number writes it: '2026-27'.
create or replace function public.van_fy()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
    from (select case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end as y
            from (select (now() at time zone 'Asia/Kolkata')::date as d) a) b;
$$;

-- p_size more numbers for a trip from its van's series. The block grows while it is the end of the
-- series (a van has one open trip, so it always is); otherwise — a new financial year — a new block
-- starts where the series stands.
create or replace function public.van_number_block(p_shop uuid, p_trip uuid, p_size integer)
returns van_trips
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
  v_fy text := van_fy();
  v_prefix text;
  v_start integer;
begin
  if p_size is null or p_size < 1 or p_size > 500 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  select coalesce(nullif(code, ''), 'VAN') || '/' || v_fy || '/' into v_prefix from godowns where id = t.vehicle_id and shop_id = p_shop;
  insert into godown_doc_counters (shop_id, kind, financial_year, next_number)
  values (p_shop, 'vanbill:' || t.vehicle_id, v_fy, 1 + p_size)
  on conflict (shop_id, kind, financial_year) do update set next_number = godown_doc_counters.next_number + p_size
  returning next_number - p_size into v_start;
  if t.number_from is not null and t.number_prefix = v_prefix and v_start = t.number_to + 1 then
    update van_trips set number_to = v_start + p_size - 1 where id = t.id returning * into t;
  else
    update van_trips set number_prefix = v_prefix, number_from = v_start, number_to = v_start + p_size - 1 where id = t.id returning * into t;
  end if;
  return t;
end;
$$;

-- The first number after every one the trip has handed out, in its current block.
create or replace function public.van_next_number(t van_trips)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(max(n), t.number_from - 1) + 1
    from van_bill_numbers
   where trip_id = t.id and prefix = t.number_prefix and n between t.number_from and t.number_to;
$$;

-- A van bill's number. p_wanted: the number the salesman's phone gave it (always so for a bill made
-- offline — the customer already has it on the slip); used when it is in the trip's block and nobody
-- has it yet. Otherwise the next free one, the block growing when it is used up.
create or replace function public.van_bill_number(p_shop uuid, p_trip uuid, p_wanted integer)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
  v_n integer;
  v_rows integer;
begin
  if t.status not in ('loaded', 'returned') then
    raise exception 'trip_not_on_route' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  if t.number_from is null or split_part(t.number_prefix, '/', 2) <> van_fy() then
    t := van_number_block(p_shop, p_trip, 30);
  end if;
  if p_wanted is not null and p_wanted between t.number_from and t.number_to then
    insert into van_bill_numbers (trip_id, prefix, n) values (t.id, t.number_prefix, p_wanted) on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      return t.number_prefix || lpad(p_wanted::text, 4, '0');
    end if;
  end if;
  v_n := van_next_number(t);
  if v_n > t.number_to then
    t := van_number_block(p_shop, p_trip, 30);
    v_n := van_next_number(t);
  end if;
  insert into van_bill_numbers (trip_id, prefix, n) values (t.id, t.number_prefix, v_n);
  return t.number_prefix || lpad(v_n::text, 4, '0');
end;
$$;

-- The trip's kept numbers, for the salesman's phone: { prefix, from, to, next }. A trip on the route
-- always keeps at least 10 spare, so billing can go on with no internet. Null once it is off the route.
create or replace function public.van_trip_numbers(p_shop uuid, p_trip uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop, p_trip);
  v_next integer;
begin
  if t.status <> 'loaded' then
    return null;
  end if;
  if t.number_from is null or split_part(t.number_prefix, '/', 2) <> van_fy() then
    t := van_number_block(p_shop, p_trip, 30);
  end if;
  v_next := van_next_number(t);
  if t.number_to - v_next < 10 then
    t := van_number_block(p_shop, p_trip, 30);
    v_next := van_next_number(t);
  end if;
  return jsonb_build_object('prefix', t.number_prefix, 'from', t.number_from, 'to', t.number_to, 'next', v_next);
end;
$$;

-- A bill from the van, as in 0066 — and a bill made offline on the route may still arrive after the
-- van is back, until the trip is settled. (New bills on a trip that is back are refused by the app.)
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
  if t.status not in ('loaded', 'returned') then
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

-- A shop return made from the van: the return itself (record_return, with its credit note, refund
-- rule and stock), then what came back goes onto the van — or, when it came back broken, into the
-- trip godown's damaged stock. One transaction. Returns record_return's answer.
create or replace function public.van_record_return(
  p_shop_id uuid, p_trip_id uuid, p_bill_id uuid, p_staff_id uuid, p_client_ref text, p_header jsonb, p_lines jsonb,
  p_credit_note text default null, p_damaged boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t van_trips := van_trip(p_shop_id, p_trip_id);
  v_default uuid := gd_default(p_shop_id);
  v_result jsonb;
  v_return returns;
  r record;
begin
  if t.status not in ('loaded', 'returned') then
    raise exception 'trip_not_open' using errcode = 'P0001', detail = jsonb_build_object('status', t.status)::text;
  end if;
  if v_default is null then
    raise exception 'no_default_godown' using errcode = 'P0001';
  end if;
  v_result := record_return(p_shop_id, p_bill_id, p_staff_id, p_client_ref, p_header, p_lines, p_credit_note);
  if v_result ->> 'result' <> 'ok' then
    return v_result;
  end if;
  select * into v_return from returns where id = (v_result ->> 'return_id')::uuid and shop_id = p_shop_id;
  update returns set van_trip_id = t.id where id = v_return.id;
  -- What the return put back on the shelf (its lines' stock_back) is in the default godown now.
  for r in
    select ri.id, ri.product_id, ri.product_name, ri.stock_back as back
      from return_items ri
     where ri.return_id = v_return.id and ri.product_id is not null and coalesce(ri.stock_back, 0) > 0
  loop
    if p_damaged then
      perform gd_saleable_out(p_shop_id, v_default, r.product_id, r.back, 'van_return_damaged', 'return', v_return.id, v_return.return_number, p_staff_id, t.trip_number);
      perform gd_damaged(p_shop_id, t.source_godown_id, r.product_id, r.back, 'van_return_damaged', 'return', v_return.id, v_return.return_number, p_staff_id, t.trip_number);
    else
      perform gd_saleable_move(p_shop_id, v_default, t.vehicle_id, r.product_id, r.back, 'van_return', 'return', v_return.id, v_return.return_number, p_staff_id, t.trip_number);
    end if;
    insert into return_dispositions (shop_id, return_id, return_item_id, product_id, product_name, quantity, disposition, godown_id, note, staff_id)
    values (p_shop_id, v_return.id, r.id, r.product_id, r.product_name, r.back,
            case when p_damaged then 'damaged' else 'to_godown' end,
            case when p_damaged then t.source_godown_id else t.vehicle_id end,
            'Van trip ' || t.trip_number, p_staff_id);
  end loop;
  return v_result;
end;
$$;

-- Settlement, as in 0066, and: each item's shop returns are recorded with its count (loaded + returned
-- − sold = expected back); the trip's unused bill numbers go back to the van's series; and, when
-- p_money.deduct_from_salary is true, the charge to the salesman is taken off his salary (a
-- 'deduction' for this month in Staff salary, his worker record found by his login).
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
  v_returned numeric;
  v_charge numeric := greatest(coalesce((p_money ->> 'salesman_charge')::numeric, 0), 0);
  v_worker uuid;
  v_deduction uuid;
  v_last integer;
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
  -- The deduction needs the salesman's salary record; refused before anything moves.
  if coalesce((p_money ->> 'deduct_from_salary')::boolean, false) and v_charge > 0 then
    if t.salesman_id is not null and to_regclass('public.workers') is not null then
      execute 'select id from workers where shop_id = $1 and staff_id = $2 and is_active order by created_at limit 1' into v_worker using p_shop, t.salesman_id;
    end if;
    if v_worker is null then
      raise exception 'no_salary_record' using errcode = 'P0001';
    end if;
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
           coalesce(-sum(quantity) filter (where kind in ('van_sale', 'van_sale_back')), 0),
           coalesce(sum(quantity) filter (where kind = 'van_return'), 0)
      into v_loaded, v_sold, v_returned
      from inventory_ledger
     where shop_id = p_shop and product_id = r.product_id and godown_id = t.vehicle_id
       and ((ref_type = 'van_trip' and ref_id = t.id) or (ref_type in ('bill', 'return') and note = t.trip_number));
    insert into van_trip_lines (trip_id, shop_id, product_id, product_name, loaded, sold, returned, expected, counted, damaged, shortage, excess)
    values (t.id, p_shop, r.product_id, r.name, v_loaded, v_sold, v_returned, v_expected, v_counted, v_damaged, v_short, v_excess);
  end loop;
  if exists (select 1 from godown_stock where godown_id = t.vehicle_id and saleable <> 0) then
    raise exception 'vehicle_not_empty' using errcode = 'P0001';
  end if;
  -- The numbers the trip kept but never used go back, so the van's next trip carries on from here.
  if t.number_from is not null then
    v_last := van_next_number(t) - 1;
    update godown_doc_counters set next_number = v_last + 1
     where shop_id = p_shop and kind = 'vanbill:' || t.vehicle_id and financial_year = split_part(t.number_prefix, '/', 2)
       and next_number = t.number_to + 1;
  end if;
  if v_worker is not null then
    execute 'insert into worker_payments (shop_id, worker_id, for_month, kind, amount, payment_method, note, staff_id) values ($1, $2, $3, ''deduction'', $4, ''other'', $5, $6) returning id'
      into v_deduction
      using p_shop, v_worker, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'), v_charge, 'Van shortage, trip ' || t.trip_number, p_staff;
  end if;
  update van_trips set
    status = 'settled', settled_at = now(), settled_by = p_staff,
    returned_at = coalesce(returned_at, now()), returned_by = coalesce(returned_by, p_staff),
    cash_expected = (p_money ->> 'cash_expected')::numeric,
    cash_handed = (p_money ->> 'cash_handed')::numeric,
    upi_expected = (p_money ->> 'upi_expected')::numeric,
    upi_received = (p_money ->> 'upi_received')::numeric,
    shortage_value = (p_money ->> 'shortage_value')::numeric,
    salesman_charge = v_charge,
    salary_deduction_id = v_deduction,
    settle_note = nullif(trim(coalesce(p_money ->> 'note', '')), '')
  where id = t.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'van_fy()',
    'van_number_block(uuid, uuid, integer)',
    'van_next_number(van_trips)',
    'van_bill_number(uuid, uuid, integer)',
    'van_trip_numbers(uuid, uuid)',
    'van_take_bill_stock(uuid, uuid, uuid, jsonb, jsonb)',
    'van_record_return(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, boolean)',
    'van_trip_settle(uuid, uuid, jsonb, jsonb, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

commit;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- Run 0066's van_take_bill_stock and van_trip_settle again to restore them, then:
-- begin;
-- drop function if exists public.van_record_return(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, boolean);
-- drop function if exists public.van_trip_numbers(uuid, uuid);
-- drop function if exists public.van_bill_number(uuid, uuid, integer);
-- drop function if exists public.van_next_number(van_trips);
-- drop function if exists public.van_number_block(uuid, uuid, integer);
-- drop function if exists public.van_fy();
-- alter table worker_payments drop constraint if exists worker_payments_kind_check;
-- alter table worker_payments add constraint worker_payments_kind_check check (kind in ('advance', 'salary', 'bonus'));  -- only with no 'deduction' rows
-- drop index if exists uq_van_visits_client_ref;
-- alter table van_visits drop column if exists client_ref, drop column if exists photo_path;
-- alter table van_expenses drop column if exists photo_path;
-- alter table godowns drop constraint if exists godowns_van_max_discount_check;
-- alter table godowns drop column if exists van_max_discount;
-- alter table van_trip_lines drop column if exists returned;
-- drop index if exists idx_returns_van_trip;
-- alter table returns drop column if exists van_trip_id;
-- drop table if exists van_bill_numbers;
-- alter table van_trips drop column if exists salary_deduction_id, drop column if exists ping_token_hash,
--   drop column if exists number_to, drop column if exists number_from, drop column if exists number_prefix;
-- commit;
