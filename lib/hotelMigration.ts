/** The hotel migration (supabase/migrations/0041_hotel.sql), kept as a string so the hotel
 * screens can offer it as one click to copy while the database is still waiting for it.
 * A test keeps the two identical. */
export const HOTEL_MIGRATION_SQL = `-- Hotel: rooms, bookings from any source (walk-in, phone, OTAs like
-- MakeMyTrip, agents), check-in / check-out, a guest folio of extra charges
-- and payments, and room service posted from the restaurant to a room.
--
-- A stay is invoiced once, at check-out, as an ordinary row in \`bills\`
-- (so GST reports, the sales figures and the customer's udhaar balance
-- pick it up with no changes) — bills.hotel_booking_id links it back.
-- Money the guest hands over before then (advance, part payments,
-- refunds) lives in hotel_payments and shows up in the daily summary by
-- the day it was received.

-- New business type. The constraint is named in schema.sql, so this
-- replaces it with the same list plus 'hotel'.
alter table shops drop constraint if exists shops_business_type_check;
alter table shops add constraint shops_business_type_check
  check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'transport', 'service', 'salon', 'jewellery', 'clinic', 'gym', 'lab', 'hotel', 'general'));

-- ─── Room types and rooms ──────────────────────────────────────────────
create table if not exists hotel_room_types (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  description text,
  -- Tariff for one night, before tax. Each booking can still negotiate its own.
  base_rate numeric(12, 2) not null default 0 check (base_rate >= 0),
  max_adults integer not null default 2 check (max_adults >= 1),
  max_children integer not null default 0 check (max_children >= 0),
  amenities text,
  -- Null = charge the standard slab for the tariff; set it only when the
  -- owner's CA says a different rate applies.
  gst_percent numeric(5, 2) check (gst_percent is null or gst_percent >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hotel_room_types enable row level security;
create index if not exists idx_hotel_room_types_shop on hotel_room_types(shop_id);

create table if not exists hotel_rooms (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  room_type_id uuid not null references hotel_room_types(id),
  room_number text not null,
  floor text,
  -- Whether housekeeping has cleaned it since the last guest left.
  housekeeping text not null default 'clean' check (housekeeping in ('clean', 'dirty')),
  -- Out of service (maintenance etc.) — never sold while blocked.
  is_blocked boolean not null default false,
  block_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hotel_rooms enable row level security;
create unique index if not exists uq_hotel_rooms_number on hotel_rooms(shop_id, room_number) where is_active;
create index if not exists idx_hotel_rooms_shop on hotel_rooms(shop_id);
create index if not exists idx_hotel_rooms_type on hotel_rooms(room_type_id);

-- ─── Bookings ──────────────────────────────────────────────────────────
create table if not exists hotel_booking_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table hotel_booking_counters enable row level security;

create or replace function next_hotel_booking_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into hotel_booking_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = hotel_booking_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists hotel_bookings (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  booking_number text not null,
  financial_year text not null,
  customer_id uuid references customers(id),
  guest_name text not null,
  guest_phone text,
  guest_email text,
  nationality text not null default 'Indian',
  adults integer not null default 1 check (adults >= 1),
  children integer not null default 0 check (children >= 0),
  -- Where it came from: walk_in, phone, website, corporate, makemytrip,
  -- goibibo, booking_com, agoda, expedia, cleartrip, airbnb, oyo, agent, other.
  source text not null default 'walk_in',
  -- The OTA's own booking / confirmation number.
  source_ref text,
  agent_name text,
  -- What the OTA or agent keeps, as a % of the room revenue.
  commission_percent numeric(5, 2) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  meal_plan text not null default 'EP' check (meal_plan in ('EP', 'CP', 'MAP', 'AP')),
  check_in_date date not null,
  check_out_date date not null,
  status text not null default 'reserved' check (status in ('reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  id_proof_type text,
  id_proof_number text,
  special_requests text,
  -- Flat discount off the stay invoice, agreed at check-out.
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- The stay's GST invoice, created at check-out.
  bill_id uuid references bills(id),
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  constraint hotel_bookings_dates_check check (check_out_date > check_in_date)
);
alter table hotel_bookings enable row level security;
create unique index if not exists uq_hotel_bookings_number on hotel_bookings(shop_id, booking_number);
create index if not exists idx_hotel_bookings_shop_status on hotel_bookings(shop_id, status);
create index if not exists idx_hotel_bookings_dates on hotel_bookings(shop_id, check_in_date, check_out_date);
create index if not exists idx_hotel_bookings_customer on hotel_bookings(customer_id);

-- A booking can hold several rooms, each at its own negotiated rate.
-- room_id stays empty until a specific room is assigned (at booking or at
-- check-in), but the row already uses up one room of its type.
create table if not exists hotel_booking_rooms (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references hotel_bookings(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  room_type_id uuid not null references hotel_room_types(id),
  room_id uuid references hotel_rooms(id),
  rate_per_night numeric(12, 2) not null check (rate_per_night >= 0),
  created_at timestamptz not null default now()
);
alter table hotel_booking_rooms enable row level security;
create index if not exists idx_hotel_booking_rooms_booking on hotel_booking_rooms(booking_id);
create index if not exists idx_hotel_booking_rooms_room on hotel_booking_rooms(room_id);
create index if not exists idx_hotel_booking_rooms_shop on hotel_booking_rooms(shop_id);

-- ─── The guest's account ───────────────────────────────────────────────
-- Extras posted to the room (laundry, extra bed, ...). Amount is before tax.
create table if not exists hotel_charges (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references hotel_bookings(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null default 'misc',
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  gst_percent numeric(5, 2) not null default 0 check (gst_percent >= 0),
  posted_by uuid references staff(id),
  created_at timestamptz not null default now()
);
alter table hotel_charges enable row level security;
create index if not exists idx_hotel_charges_booking on hotel_charges(booking_id);

-- Money in (advance at booking, part payments, final settlement) and out
-- (refunds). Amount is always positive; kind says which way it went.
create table if not exists hotel_payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references hotel_bookings(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null default 'payment' check (kind in ('advance', 'payment', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  reference text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
alter table hotel_payments enable row level security;
create index if not exists idx_hotel_payments_booking on hotel_payments(booking_id);
create index if not exists idx_hotel_payments_shop_date on hotel_payments(shop_id, created_at);

-- ─── Hooks into the rest of the app ────────────────────────────────────
-- The stay invoice points back at its booking (so the daily summary can
-- count its money from hotel_payments instead of twice).
alter table bills add column if not exists hotel_booking_id uuid references hotel_bookings(id);
create index if not exists idx_bills_hotel_booking on bills(hotel_booking_id) where hotel_booking_id is not null;

-- Room service: every room gets its own table in the restaurant, so a
-- guest's order goes through the normal order → kitchen → serve flow.
alter table restaurant_tables add column if not exists hotel_room_id uuid references hotel_rooms(id) on delete set null;
create index if not exists idx_restaurant_tables_room on restaurant_tables(hotel_room_id) where hotel_room_id is not null;

-- An order charged to a room is closed on the spot and paid for at
-- check-out with the rest of the guest's bill.
alter table restaurant_orders add column if not exists hotel_booking_id uuid references hotel_bookings(id) on delete set null;
create index if not exists idx_restaurant_orders_hotel on restaurant_orders(hotel_booking_id) where hotel_booking_id is not null;

insert into schema_migrations (version) values ('0041_hotel') on conflict (version) do nothing;
`;
