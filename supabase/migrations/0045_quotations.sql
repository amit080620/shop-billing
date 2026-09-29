-- Quotations (estimates): a price offer sent before a sale, turned into a bill in one tap.
--
-- A contractor asks the hardware shop for a price list, a customer wants a repair estimate, a
-- company wants a quote before ordering. The quotation keeps the cart exactly as quoted — the
-- lines already priced by the same rules a bill uses — with its own Q/<financial year>/<number>
-- series and a date it is valid until. When the customer agrees, "Make bill" opens a new bill
-- with those lines; the quotation then points to that bill. It is not a tax document: it never
-- touches stock, udhaar or GST reports.

create table if not exists quotation_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table quotation_counters enable row level security;

create or replace function next_quotation_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into quotation_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = quotation_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists quotations (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  quote_number text not null,
  financial_year text not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  items jsonb not null,                        -- the lines as quoted, already priced
  discount_type text not null default 'flat',
  discount_value numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  round_off_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  supply_type text not null default 'intra',
  valid_until date,
  notes text,
  status text not null default 'open' check (status in ('open', 'converted', 'cancelled')),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_quotations_number on quotations (shop_id, quote_number);
create index if not exists idx_quotations_shop_created on quotations (shop_id, created_at desc);

alter table quotations enable row level security;
