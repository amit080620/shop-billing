-- Money balances computed inside Postgres instead of in the app.
--
-- The dashboard, customers, parties, vendors and ledger screens used to
-- download every bill, payment and purchase a shop ever made and add them
-- up in JavaScript on every page load — slower with every sale. These
-- functions return just the totals.
--
-- A customer's balance = credit from active bills + settled restaurant
-- orders + non-cancelled rentals, minus payments received. (Restaurant and
-- rental credit used to be left out of the customers list, dashboard and
-- ledger, so a restaurant's table-order udhaar didn't show up there.)
-- A vendor's balance = purchase payables minus payments made to them.
--
-- Safe to re-run. Only the server (service_role) may call these: they take
-- any shop id, so they must never be reachable from the browser.

-- Indexes these functions rely on (same names as migration 0036 — nothing
-- is created twice if that already ran).
create index if not exists idx_bills_shop_status_created on bills(shop_id, status, created_at desc);
create index if not exists idx_payments_shop_id on payments(shop_id);
create index if not exists idx_purchases_shop_id on purchases(shop_id);
create index if not exists idx_purchase_payments_shop_id on purchase_payments(shop_id);
create index if not exists idx_restaurant_orders_shop_status on restaurant_orders(shop_id, status);
create index if not exists idx_rentals_shop_status on rentals(shop_id, status);

-- What each customer owes (negative = paid in advance). Pass customer ids
-- to limit the result to those customers.
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
    select p.customer_id, -p.amount
      from payments p
     where p.shop_id = p_shop_id
  ) x
  where p_customer_ids is null or x.customer_id = any(p_customer_ids)
  group by x.customer_id;
$$;

-- What the shop owes each vendor (negative = paid in advance).
create or replace function vendor_balances(p_shop_id uuid, p_vendor_ids uuid[] default null)
returns table (vendor_id uuid, balance numeric)
language sql
stable
as $$
  select y.vendor_id, sum(y.amount) as balance
  from (
    select pu.vendor_id, pu.payable_amount as amount
      from purchases pu
     where pu.shop_id = p_shop_id and pu.payable_amount <> 0
    union all
    select pp.vendor_id, -pp.amount
      from purchase_payments pp
     where pp.shop_id = p_shop_id
  ) y
  where p_vendor_ids is null or y.vendor_id = any(p_vendor_ids)
  group by y.vendor_id;
$$;

-- Shop-wide totals for the dashboard. Only positive balances count, so a
-- customer who paid in advance doesn't hide what another customer owes.
create or replace function shop_money_summary(p_shop_id uuid)
returns table (customer_outstanding numeric, customers_with_dues integer, vendor_payable numeric)
language sql
stable
as $$
  with c as (select cb.balance from customer_balances(p_shop_id) cb where cb.balance > 0),
       v as (select vb.balance from vendor_balances(p_shop_id) vb where vb.balance > 0)
  select
    coalesce((select sum(c.balance) from c), 0),
    (select count(*)::int from c),
    coalesce((select sum(v.balance) from v), 0);
$$;

revoke all on function customer_balances(uuid, uuid[]) from public, anon, authenticated;
revoke all on function vendor_balances(uuid, uuid[]) from public, anon, authenticated;
revoke all on function shop_money_summary(uuid) from public, anon, authenticated;
grant execute on function customer_balances(uuid, uuid[]) to service_role;
grant execute on function vendor_balances(uuid, uuid[]) to service_role;
grant execute on function shop_money_summary(uuid) to service_role;
