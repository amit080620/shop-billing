-- Hotel operations: housekeeping stages and log, maintenance tickets, rate rules, night audit,
-- company and agent accounts, guest details for Form C, a direct booking page with its requests,
-- iCal calendars from booking sites, banquet halls and events.
--
-- Additive, and only for hotel shops: new tables, new columns on hotel_rooms and hotel_bookings, and
-- a wider list of housekeeping states. Nothing existing changes meaning; 'clean' and 'dirty' stay as
-- they are. Rollback: see the end of this file.

begin;

-- ─── Housekeeping ──────────────────────────────────────────────────────────────
-- dirty → cleaning → clean → inspected. A room can be sold as ready at clean or inspected.
alter table hotel_rooms drop constraint if exists hotel_rooms_housekeeping_check;
alter table hotel_rooms add constraint hotel_rooms_housekeeping_check check (housekeeping in ('clean', 'dirty', 'cleaning', 'inspected'));
alter table hotel_rooms add column if not exists assigned_to uuid references staff(id) on delete set null;
alter table hotel_rooms add column if not exists housekeeping_by uuid references staff(id) on delete set null;
alter table hotel_rooms add column if not exists housekeeping_at timestamptz;
-- Back in service on this day, when known (a ticket's estimate; shown, never acted on by itself).
alter table hotel_rooms add column if not exists blocked_until date;

create table if not exists hotel_housekeeping_log (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  room_id uuid not null references hotel_rooms(id) on delete cascade,
  from_state text,
  to_state text not null,
  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table hotel_housekeeping_log enable row level security;
create index if not exists idx_hotel_hk_log_shop_time on hotel_housekeeping_log(shop_id, created_at desc);

-- Every change of a room's state is logged here, whichever screen made it.
create or replace function public.hotel_room_housekeeping_log()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.housekeeping is distinct from old.housekeeping then
    insert into hotel_housekeeping_log (shop_id, room_id, from_state, to_state, staff_id)
    values (new.shop_id, new.id, old.housekeeping, new.housekeeping, new.housekeeping_by);
    new.housekeeping_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hotel_room_housekeeping_log on hotel_rooms;
create trigger trg_hotel_room_housekeeping_log
  before update on hotel_rooms
  for each row execute function public.hotel_room_housekeeping_log();

-- ─── Maintenance ───────────────────────────────────────────────────────────────
create table if not exists hotel_maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  room_id uuid references hotel_rooms(id) on delete set null,
  category text not null default 'other' check (category in ('ac', 'plumbing', 'electrical', 'furniture', 'tv_wifi', 'cleaning', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  title text not null check (length(trim(title)) > 0),
  note text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  assigned_to text,
  -- Whether this ticket took the room out of order; closing it offers the room back.
  blocks_room boolean not null default false,
  cost numeric(12, 2) check (cost is null or cost >= 0),
  resolution text,
  reported_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table hotel_maintenance_tickets enable row level security;
create index if not exists idx_hotel_tickets_shop_status on hotel_maintenance_tickets(shop_id, status, created_at desc);

-- ─── Rate rules ────────────────────────────────────────────────────────────────
-- What a night should cost: a set rate, or the base rate up or down by a % or an amount, for some
-- dates, weekdays or when occupancy is high. A suggestion at booking; the desk can always change it.
create table if not exists hotel_rate_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  room_type_id uuid references hotel_room_types(id) on delete cascade,
  start_date date,
  end_date date,
  -- 0 = Sunday … 6 = Saturday; null means every day.
  weekdays integer[],
  kind text not null default 'percent' check (kind in ('set', 'percent', 'amount')),
  value numeric(12, 2) not null default 0,
  min_occupancy integer check (min_occupancy is null or (min_occupancy >= 0 and min_occupancy <= 100)),
  min_stay integer check (min_stay is null or min_stay >= 1),
  closed_to_arrival boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint hotel_rate_rules_dates check (start_date is null or end_date is null or end_date >= start_date)
);
alter table hotel_rate_rules enable row level security;
create index if not exists idx_hotel_rate_rules_shop on hotel_rate_rules(shop_id) where is_active;

-- ─── Night audit ───────────────────────────────────────────────────────────────
-- One closed business day: the flash report's figures as they stood, kept as they were.
create table if not exists hotel_night_audits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  business_date date not null,
  figures jsonb not null,
  note text,
  closed_by uuid references staff(id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (shop_id, business_date)
);
alter table hotel_night_audits enable row level security;

-- ─── Companies and agents ──────────────────────────────────────────────────────
create table if not exists hotel_accounts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null default 'company' check (kind in ('company', 'agent')),
  name text not null check (length(trim(name)) > 0),
  gstin text,
  address text,
  contact_person text,
  phone text,
  email text,
  -- An agreed rate: this % off the room's rate (company), or this commission % (agent).
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  commission_percent numeric(5, 2) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  credit_days integer check (credit_days is null or credit_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hotel_accounts enable row level security;
create unique index if not exists uq_hotel_accounts_name on hotel_accounts(shop_id, lower(name)) where is_active;

-- ─── Guest details and the bill-to on a booking ────────────────────────────────
alter table hotel_bookings add column if not exists account_id uuid references hotel_accounts(id) on delete set null;
alter table hotel_bookings add column if not exists group_name text;
alter table hotel_bookings add column if not exists expected_arrival text;
alter table hotel_bookings add column if not exists guest_address text;
-- Form C (foreign guests).
alter table hotel_bookings add column if not exists gender text;
alter table hotel_bookings add column if not exists date_of_birth date;
alter table hotel_bookings add column if not exists passport_number text;
alter table hotel_bookings add column if not exists passport_issued_at text;
alter table hotel_bookings add column if not exists passport_issue_date date;
alter table hotel_bookings add column if not exists passport_expiry date;
alter table hotel_bookings add column if not exists visa_number text;
alter table hotel_bookings add column if not exists visa_type text;
alter table hotel_bookings add column if not exists visa_issued_at text;
alter table hotel_bookings add column if not exists visa_issue_date date;
alter table hotel_bookings add column if not exists visa_expiry date;
alter table hotel_bookings add column if not exists arrival_in_india date;
alter table hotel_bookings add column if not exists arrived_from text;
alter table hotel_bookings add column if not exists going_to text;
alter table hotel_bookings add column if not exists visit_purpose text;
-- The hotel's own note that it filed this guest on the FRRO portal.
alter table hotel_bookings add column if not exists form_c_filed_at timestamptz;
alter table hotel_bookings add column if not exists form_c_reference text;

-- ─── Direct booking page ───────────────────────────────────────────────────────
create table if not exists hotel_public_pages (
  shop_id uuid primary key references shops(id) on delete cascade,
  token text not null unique,
  is_enabled boolean not null default false,
  about text,
  policies text,
  -- Shown to guests on the page. The owner's own mobile is never shown.
  contact_phone text,
  created_at timestamptz not null default now()
);
alter table hotel_public_pages enable row level security;

-- A guest's request from the page. It holds no room until the desk accepts it as a booking.
create table if not exists hotel_booking_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  room_type_id uuid references hotel_room_types(id) on delete set null,
  rooms integer not null default 1 check (rooms between 1 and 10),
  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  adults integer not null default 1,
  children integer not null default 0,
  check_in_date date not null,
  check_out_date date not null,
  quoted_rate numeric(12, 2),
  message text,
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  booking_id uuid references hotel_bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hotel_booking_requests_dates check (check_out_date > check_in_date)
);
alter table hotel_booking_requests enable row level security;
create index if not exists idx_hotel_requests_shop on hotel_booking_requests(shop_id, status, created_at desc);

-- ─── iCal calendars from booking sites ─────────────────────────────────────────
create table if not exists hotel_ical_feeds (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  room_type_id uuid not null references hotel_room_types(id) on delete cascade,
  label text not null,
  url text not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (shop_id, url)
);
alter table hotel_ical_feeds enable row level security;

-- Dates a site has sold. Each block holds one room of its type, like a booking without a room.
create table if not exists hotel_ical_blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  feed_id uuid not null references hotel_ical_feeds(id) on delete cascade,
  room_type_id uuid not null references hotel_room_types(id) on delete cascade,
  uid text not null,
  start_date date not null,
  end_date date not null,
  summary text,
  unique (feed_id, uid),
  constraint hotel_ical_blocks_dates check (end_date > start_date)
);
alter table hotel_ical_blocks enable row level security;
create index if not exists idx_hotel_ical_blocks_shop on hotel_ical_blocks(shop_id, end_date);

-- ─── Banquet and events ────────────────────────────────────────────────────────
create table if not exists hotel_halls (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  capacity integer check (capacity is null or capacity >= 0),
  rate numeric(12, 2) not null default 0 check (rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hotel_halls enable row level security;

create table if not exists hotel_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  event_number text not null,
  hall_id uuid references hotel_halls(id) on delete set null,
  event_name text not null,
  client_name text not null,
  client_phone text,
  company_name text,
  company_gstin text,
  company_address text,
  event_date date not null,
  session text not null default 'full_day' check (session in ('morning', 'evening', 'full_day')),
  guests integer not null default 0 check (guests >= 0),
  hall_rent numeric(12, 2) not null default 0 check (hall_rent >= 0),
  plate_rate numeric(12, 2) not null default 0 check (plate_rate >= 0),
  plates integer not null default 0 check (plates >= 0),
  decoration numeric(12, 2) not null default 0 check (decoration >= 0),
  other_amount numeric(12, 2) not null default 0 check (other_amount >= 0),
  other_label text,
  gst_percent numeric(5, 2) not null default 18 check (gst_percent >= 0),
  menu text,
  note text,
  status text not null default 'enquiry' check (status in ('enquiry', 'confirmed', 'completed', 'cancelled')),
  customer_id uuid references customers(id) on delete set null,
  bill_id uuid references bills(id) on delete set null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, event_number)
);
alter table hotel_events enable row level security;
create index if not exists idx_hotel_events_shop_date on hotel_events(shop_id, event_date);
-- One hall, one session, one confirmed event. Full day takes both sessions (checked in the app too).
create unique index if not exists uq_hotel_events_hall_session on hotel_events(hall_id, event_date, session) where status in ('confirmed', 'completed') and hall_id is not null;

create table if not exists hotel_event_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  event_id uuid not null references hotel_events(id) on delete cascade,
  kind text not null default 'advance' check (kind in ('advance', 'payment', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  reference text,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table hotel_event_payments enable row level security;
create index if not exists idx_hotel_event_payments_event on hotel_event_payments(event_id);
create index if not exists idx_hotel_event_payments_shop_date on hotel_event_payments(shop_id, created_at);

-- ─── Items on the guest's account ──────────────────────────────────────────────
-- A minibar or toiletry item posted to a room: which item and how many, so removing the charge
-- puts the stock back.
alter table hotel_charges add column if not exists product_id uuid references products(id) on delete set null;
alter table hotel_charges add column if not exists quantity numeric(12, 3);

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    execute $q$insert into schema_migrations (version) values ('0065_hotel_operations') on conflict (version) do nothing$q$;
  end if;
end;
$$;

commit;

-- Rollback (only if nothing has been used):
-- alter table hotel_charges drop column if exists product_id, drop column if exists quantity;
-- drop table if exists hotel_event_payments, hotel_events, hotel_halls, hotel_ical_blocks, hotel_ical_feeds,
--   hotel_booking_requests, hotel_public_pages, hotel_accounts cascade, hotel_night_audits, hotel_rate_rules,
--   hotel_maintenance_tickets, hotel_housekeeping_log;
-- drop trigger if exists trg_hotel_room_housekeeping_log on hotel_rooms;
-- drop function if exists public.hotel_room_housekeeping_log();
-- update hotel_rooms set housekeeping = case when housekeeping = 'cleaning' then 'dirty' when housekeeping = 'inspected' then 'clean' else housekeeping end;
-- alter table hotel_rooms drop constraint if exists hotel_rooms_housekeeping_check;
-- alter table hotel_rooms add constraint hotel_rooms_housekeeping_check check (housekeeping in ('clean', 'dirty'));
