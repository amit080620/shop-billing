-- GST: every invoice freezes who it was billed to, and debit notes exist.
--
-- Until now an invoice's buyer name / GSTIN / state were read live from the customer record, so
-- editing a customer later silently changed invoices already issued, and the GSTR-1 of months
-- already filed. These columns hold what was on the invoice the moment it was issued. They also
-- let one bill go to a different GSTIN than the customer's own — an employee buying for their
-- company ("Bill to ABC Pvt Ltd, GSTIN ...") so the company can claim the input tax credit —
-- which is what the B2B switch on the bill screen fills in. A bill is B2B exactly when
-- buyer_gstin is set.

alter table bills add column if not exists buyer_name text;
alter table bills add column if not exists buyer_gstin text;
alter table bills add column if not exists buyer_address text;
alter table bills add column if not exists buyer_state text;
alter table bills add column if not exists buyer_state_code text;

-- Existing bills keep showing exactly what they show today: the customer's current details.
update bills b
set buyer_name = c.name,
    buyer_gstin = c.gstin,
    buyer_address = c.address,
    buyer_state = c.state,
    buyer_state_code = c.state_code
from customers c
where b.customer_id = c.id
  and b.buyer_name is null;

-- Restaurant bills live in their own table; a corporate lunch or banquet bill needs the same.
alter table restaurant_orders add column if not exists buyer_name text;
alter table restaurant_orders add column if not exists buyer_gstin text;
alter table restaurant_orders add column if not exists buyer_address text;
alter table restaurant_orders add column if not exists buyer_state text;
alter table restaurant_orders add column if not exists buyer_state_code text;

-- ─── Debit notes ─────────────────────────────────────────────────────────
-- The opposite of a credit note: raises the value of an invoice already issued (a price billed
-- too low, a charge added afterwards). Reported in GSTR-1 Table 9B beside credit notes, and adds
-- to that month's output tax in GSTR-3B. Own number series, DN/<financial year>/<number>.
create table if not exists debit_note_counters (
  shop_id uuid not null references shops(id) on delete cascade,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (shop_id, financial_year)
);
alter table debit_note_counters enable row level security;

create or replace function next_debit_note_number(p_shop_id uuid, p_financial_year text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into debit_note_counters (shop_id, financial_year, last_number)
  values (p_shop_id, p_financial_year, 1)
  on conflict (shop_id, financial_year)
  do update set last_number = debit_note_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

create table if not exists debit_notes (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  -- Cascades so deleting a shop (which removes its bills) can never be blocked by a debit note.
  bill_id uuid not null references bills(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  staff_id uuid not null references staff(id),
  note_number text not null,
  financial_year text not null,
  reason text not null,
  taxable_amount numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  -- Collected on the spot, or (udhar) added to what the customer owes.
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other', 'udhar')),
  paid_amount numeric(12, 2) not null default 0,
  credit_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
-- (Safe if an earlier copy of this file already created the table without these.)
alter table debit_notes add column if not exists customer_id uuid references customers(id) on delete set null;
alter table debit_notes add column if not exists payment_method text not null default 'cash';
alter table debit_notes add column if not exists paid_amount numeric(12, 2) not null default 0;
alter table debit_notes add column if not exists credit_amount numeric(12, 2) not null default 0;
alter table debit_notes enable row level security;
create index if not exists idx_debit_notes_shop_created on debit_notes(shop_id, created_at);
create index if not exists idx_debit_notes_bill on debit_notes(bill_id);

-- ─── Returns adjusted against udhaar ─────────────────────────────────────
-- A return refunded as "adjust against credit" only said so on the credit note; the customer's
-- udhaar never went down. It now writes an adjustment entry in payments (method 'adjustment'):
-- every balance, reminder and ledger already counts payments, while the daily cash summary
-- leaves it out, since no money changed hands.
alter table payments drop constraint if exists payments_payment_method_check;
alter table payments add constraint payments_payment_method_check
  check (payment_method in ('cash', 'card', 'upi', 'online', 'other', 'adjustment'));

-- ─── Customer balances include debit notes left on udhar ───────────────
create or replace function customer_balances(p_shop_id uuid, p_customer_ids uuid[] default null)
returns table (customer_id uuid, balance numeric)
language sql
stable
as $$
  select x.customer_id, sum(x.amount) as balance
  from (
    select b.customer_id, b.credit_amount as amount
      from bills b
     where b.shop_id = p_shop_id and b.status = 'active' and b.customer_id is not null and b.credit_amount <> 0
    union all
    select o.customer_id, o.credit_amount
      from restaurant_orders o
     where o.shop_id = p_shop_id and o.status = 'settled' and o.customer_id is not null and o.credit_amount <> 0
    union all
    select r.customer_id, r.credit_amount
      from rentals r
     where r.shop_id = p_shop_id and r.status <> 'cancelled' and r.customer_id is not null and r.credit_amount <> 0
    union all
    select d.customer_id, d.credit_amount
      from debit_notes d
      join bills db on db.id = d.bill_id and db.status = 'active'
     where d.shop_id = p_shop_id and d.customer_id is not null and d.credit_amount <> 0
    union all
    select p.customer_id, -p.amount
      from payments p
     where p.shop_id = p_shop_id
  ) x
  where p_customer_ids is null or x.customer_id = any(p_customer_ids)
  group by x.customer_id;
$$;
revoke all on function customer_balances(uuid, uuid[]) from public, anon, authenticated;
grant execute on function customer_balances(uuid, uuid[]) to service_role;

insert into schema_migrations (version) values ('0042_gst_buyer_snapshot_debit_notes') on conflict (version) do nothing;
