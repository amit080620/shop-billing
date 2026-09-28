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
  created_at timestamptz not null default now()
);
alter table debit_notes enable row level security;
create index if not exists idx_debit_notes_shop_created on debit_notes(shop_id, created_at);
create index if not exists idx_debit_notes_bill on debit_notes(bill_id);

insert into schema_migrations (version) values ('0042_gst_buyer_snapshot_debit_notes') on conflict (version) do nothing;
