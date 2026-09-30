-- Wholesale / distributor shops: a business type of their own, and what a distributor's day needs.
--
-- A. 'wholesale' business type.
-- B. Party-wise rates: an item's wholesale rate, and each party's rate level (retail or wholesale).
-- C. Credit days per party, and each bill's due date (bill date + the party's credit days).
-- D. The party's beat / area (the salesman's route).
-- E. Sales orders: a salesman books an order (a quotation of kind 'order'), billed later in one tap.

-- A ─────────────────────────────────────────────────────────────────────
alter table shops drop constraint if exists shops_business_type_check;
alter table shops add constraint shops_business_type_check
  check (business_type in ('grocery', 'restaurant', 'mart', 'hardware', 'pharmacy', 'rental', 'transport', 'service', 'salon', 'jewellery', 'clinic', 'gym', 'lab', 'hotel', 'wholesale', 'general'));

-- B ─────────────────────────────────────────────────────────────────────
alter table products add column if not exists wholesale_price numeric(12, 2);
alter table products drop constraint if exists products_wholesale_price_check;
alter table products add constraint products_wholesale_price_check check (wholesale_price is null or wholesale_price >= 0);

alter table customers add column if not exists price_level text not null default 'retail';
alter table customers drop constraint if exists customers_price_level_check;
alter table customers add constraint customers_price_level_check check (price_level in ('retail', 'wholesale'));

-- C ─────────────────────────────────────────────────────────────────────
alter table customers add column if not exists credit_days integer;
alter table customers drop constraint if exists customers_credit_days_check;
alter table customers add constraint customers_credit_days_check check (credit_days is null or credit_days between 0 and 365);
alter table bills add column if not exists due_date date;

-- D ─────────────────────────────────────────────────────────────────────
alter table customers add column if not exists beat text;
create index if not exists idx_customers_beat on customers (shop_id, beat);

-- E ─────────────────────────────────────────────────────────────────────
alter table quotations add column if not exists kind text not null default 'quote';
alter table quotations drop constraint if exists quotations_kind_check;
alter table quotations add constraint quotations_kind_check check (kind in ('quote', 'order'));
create index if not exists idx_quotations_kind on quotations (shop_id, kind, status);
