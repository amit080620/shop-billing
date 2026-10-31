-- One bill, paid more than one way: ₹10 cash + ₹90 UPI, or part card, part UPI, the rest on udhaar.
--
-- 1. bill_payments: each money payment of a bill — its mode (cash, card, upi, online = bank
--    transfer / online, other), its amount and an optional reference (UPI ref, card's last digits,
--    bank UTR). Only money: udhaar stays bills.credit_amount, and old gold handed over, a gold
--    scheme or prepaid balance used stay folded into bills.paid_amount as before (the part of
--    paid_amount that no payment row explains). So for every bill:
--        total = paid_amount + credit_amount, and paid_amount = its payment rows + that non-money part.
--    A row always belongs to a bill of the same shop, and the rows never add up to more than the
--    bill's paid_amount. A bill's rows count only while the bill is active: a voided bill's rows
--    simply stop counting — nothing is reversed, so nothing can be reversed twice.
--    Bills made before this release have no rows: they keep reading as before (payment_method +
--    paid_amount). Nothing old is changed or backfilled.
-- 2. set_bill_payments: sets a bill's payment rows in one transaction holding the bill — at the
--    sale, or when an owner changes how a bill was paid — and keeps paid_amount, credit_amount and
--    payment_method (the mode that took the most, for every report that reads one mode) in step.
-- 3. A bill's paid amount is never cut quietly: an edit that would bring the total below what was
--    already paid is refused (paid_exceeds_total) — the shop makes a return or credit note first.
-- 4. A return's refund, in a money mode, never exceeds what the bill took in that mode
--    (refund_exceeds_mode) — for bills that have payment rows; older bills keep the old rule.
--
-- Additive only: a new table, two functions, three triggers. No existing row, column or function
-- changes (migration 0060's stock functions are untouched). Rollback: see the end of this file.

begin;

-- ─── 1. The payments of a bill ───────────────────────────────────────────────────

create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text check (reference is null or char_length(reference) <= 100),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_bill_payments_bill on public.bill_payments (bill_id);
create index if not exists idx_bill_payments_shop_day on public.bill_payments (shop_id, created_at);
-- Read and written only by the server (service role), like every other table.
alter table public.bill_payments enable row level security;

-- A row is for a bill of its own shop, and the rows never add up to more than the bill's paid amount.
create or replace function public.bill_payments_check()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_shop uuid;
  v_paid numeric;
  v_others numeric;
begin
  select shop_id, paid_amount into v_shop, v_paid from bills where id = new.bill_id;
  if not found or v_shop is distinct from new.shop_id then
    raise exception 'invalid_payment' using errcode = '22023', detail = 'the payment is not for a bill of this shop';
  end if;
  select coalesce(sum(amount), 0) into v_others from bill_payments where bill_id = new.bill_id and id <> new.id;
  if v_others + new.amount > v_paid + 0.005 then
    raise exception 'payments_exceed_paid'
      using errcode = '22023',
            detail = jsonb_build_object('bill_id', new.bill_id, 'paid', v_paid, 'payments', v_others + new.amount)::text,
            hint = 'The payment rows add up to more than the bill''s paid amount.';
  end if;
  return new;
end;
$$;

drop trigger if exists bill_payments_check on public.bill_payments;
create trigger bill_payments_check
  before insert or update on public.bill_payments
  for each row execute function public.bill_payments_check();

-- ─── 2. Setting how a bill was paid ──────────────────────────────────────────────

-- p_payments: [{"method", "amount", "reference"?}] — every money payment of the bill (an empty list:
-- no money paid). Replaces the bill's rows, all in one go, holding the bill (the row a return and
-- a void hold too). paid_amount becomes the rows plus the bill's non-money part: p_non_money where
-- given (the sale knows its old gold, scheme and prepaid balance), else what the bill already had
-- (paid_amount less its old rows; a bill without rows — from before this release — had all of it
-- as money). credit_amount (udhaar) is the rest of the total; payment_method the mode that took
-- the most.
-- Refused, with nothing changed: more paid than the total (over_allocated); udhaar added to a bill
-- with no customer (udhaar_needs_customer); udhaar changed on a bill with a return adjusted against
-- udhaar (has_credit_adjustment); a mode left with less than its returns already refunded
-- (refund_exceeds_mode); a bad row (invalid_payment).
-- {"result": "ok", "paid", "credit", "method"} · {"result": "voided"}.
create or replace function public.set_bill_payments(p_shop_id uuid, p_bill_id uuid, p_payments jsonb, p_staff_id uuid default null, p_non_money numeric default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb := coalesce(p_payments, '[]'::jsonb);
  v_bill record;
  v_old_sum numeric;
  v_has_rows boolean;
  v_non_money numeric;
  v_sum numeric;
  v_paid numeric;
  v_credit numeric;
  v_top text;
  v_bad record;
begin
  if jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) > 10 then
    raise exception 'invalid_payment' using errcode = '22023', detail = 'payments must be a list of at most 10';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_rows) e
    where (e ->> 'method') is null or (e ->> 'method') not in ('cash', 'card', 'upi', 'online', 'other')
       or jsonb_typeof(e -> 'amount') is distinct from 'number'
       or (e ->> 'amount')::numeric <= 0
       or round((e ->> 'amount')::numeric, 2) <> (e ->> 'amount')::numeric
       or (e ? 'reference' and jsonb_typeof(e -> 'reference') not in ('string', 'null'))
       or char_length(coalesce(e ->> 'reference', '')) > 100
  ) then
    raise exception 'invalid_payment' using errcode = '22023', detail = 'every payment needs a known mode and an amount above 0 (to the paisa)';
  end if;
  if p_non_money is not null and p_non_money < 0 then
    raise exception 'invalid_payment' using errcode = '22023', detail = 'the non-money part can''t be below 0';
  end if;

  select id, status, total, paid_amount, credit_amount, customer_id into v_bill
  from bills where id = p_bill_id and shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'invalid_payment' using errcode = '22023', detail = 'bill not found';
  end if;
  if v_bill.status is distinct from 'active' then
    return jsonb_build_object('result', 'voided');
  end if;

  select coalesce(sum(amount), 0), count(*) > 0 into v_old_sum, v_has_rows from bill_payments where bill_id = p_bill_id;
  v_non_money := round(coalesce(p_non_money, case when v_has_rows then v_bill.paid_amount - v_old_sum else 0 end), 2);
  select coalesce(sum((e ->> 'amount')::numeric), 0) into v_sum from jsonb_array_elements(v_rows) e;
  v_paid := round(v_non_money + v_sum, 2);
  if v_paid > v_bill.total + 0.005 then
    raise exception 'over_allocated'
      using errcode = '22023',
            detail = jsonb_build_object('total', v_bill.total, 'paid', v_paid)::text,
            hint = 'The payments add up to more than the bill.';
  end if;
  v_credit := round(v_bill.total - v_paid, 2);

  if v_credit > v_bill.credit_amount + 0.005 and v_bill.customer_id is null then
    raise exception 'udhaar_needs_customer' using errcode = '22023', detail = 'udhaar needs the bill''s customer';
  end if;
  if abs(v_credit - v_bill.credit_amount) > 0.005
     and exists (select 1 from returns r where r.bill_id = p_bill_id and r.shop_id = p_shop_id and r.refund_method = 'credit_adjustment') then
    raise exception 'has_credit_adjustment' using errcode = '22023', detail = 'a return of this bill was adjusted against udhaar';
  end if;
  -- What returns already refunded in a mode stays covered by that mode.
  select r.refund_method as method, sum(r.total) as refunded,
         coalesce((select sum((e ->> 'amount')::numeric) from jsonb_array_elements(v_rows) e where e ->> 'method' = r.refund_method), 0) as kept
  into v_bad
  from returns r
  where r.bill_id = p_bill_id and r.shop_id = p_shop_id and r.refund_method in ('cash', 'card', 'upi', 'online', 'other')
  group by r.refund_method
  having sum(r.total) > coalesce((select sum((e ->> 'amount')::numeric) from jsonb_array_elements(v_rows) e where e ->> 'method' = r.refund_method), 0) + 0.005
  limit 1;
  if found then
    raise exception 'refund_exceeds_mode'
      using errcode = '22023',
            detail = jsonb_build_object('method', v_bad.method, 'refunded', v_bad.refunded, 'received', v_bad.kept)::text,
            hint = 'Returns already refunded more in this mode than the new payments leave in it.';
  end if;

  select e ->> 'method' into v_top
  from jsonb_array_elements(v_rows) with ordinality x(e, n)
  order by (e ->> 'amount')::numeric desc, n
  limit 1;

  -- The rows go first, then the bill's figures, then the new rows (each checked against the new paid amount).
  delete from bill_payments where bill_id = p_bill_id;
  update bills
  set paid_amount = v_paid, credit_amount = v_credit, payment_method = coalesce(v_top, payment_method)
  where id = p_bill_id;
  insert into bill_payments (shop_id, bill_id, payment_method, amount, reference, created_by)
  select p_shop_id, p_bill_id, e ->> 'method', (e ->> 'amount')::numeric, nullif(btrim(e ->> 'reference'), ''), p_staff_id
  from jsonb_array_elements(v_rows) with ordinality x(e, n)
  order by n;

  return jsonb_build_object('result', 'ok', 'paid', v_paid, 'credit', v_credit, 'method', coalesce(v_top, (select payment_method from bills where id = p_bill_id)));
end;
$$;

revoke all on function public.set_bill_payments(uuid, uuid, jsonb, uuid, numeric) from public, anon, authenticated;
grant execute on function public.set_bill_payments(uuid, uuid, jsonb, uuid, numeric) to service_role;

-- ─── 3. A bill's paid amount is never cut quietly ───────────────────────────────────

-- On an active bill: the paid amount can't drop because the total fell below it (an edit that
-- lowers the total under what was paid is refused — the shop makes a return or credit note
-- first), and never below the bill's payment rows. A void is not affected (it changes the
-- status, not the amounts), nor is a bill moving money to udhaar with its total unchanged.
create or replace function public.bills_paid_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows numeric;
begin
  if new.status = 'active' and old.status = 'active' and new.paid_amount < old.paid_amount - 0.005 then
    if new.total < old.paid_amount - 0.005 then
      raise exception 'paid_exceeds_total'
        using errcode = '22023',
              detail = jsonb_build_object('bill_id', new.id, 'paid', old.paid_amount, 'total', new.total)::text,
              hint = 'The new total is less than what was already paid. Make a return or credit note first.';
    end if;
    select coalesce(sum(amount), 0) into v_rows from bill_payments where bill_id = new.id;
    if new.paid_amount + 0.005 < v_rows then
      raise exception 'payments_exceed_paid'
        using errcode = '22023',
              detail = jsonb_build_object('bill_id', new.id, 'paid', new.paid_amount, 'payments', v_rows)::text;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bills_paid_guard on public.bills;
create trigger bills_paid_guard
  before update of paid_amount, total on public.bills
  for each row execute function public.bills_paid_guard();

-- ─── 4. A refund stays within what the bill took in that mode ───────────────────────

-- A return refunded in cash, card, UPI, online or other: never more, over all the bill's returns in
-- that mode, than the bill's payment rows took in it. Udhaar adjustments ('credit_adjustment') are
-- not money and keep their own rules. Bills without payment rows (from before this release) keep
-- the old rule. A return holds its bill's row (record_return), so two returns at once are checked
-- one after the other.
create or replace function public.returns_refund_within_mode()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_received numeric;
  v_refunded numeric;
begin
  if new.refund_method not in ('cash', 'card', 'upi', 'online', 'other') then
    return new;
  end if;
  if not exists (select 1 from bill_payments where bill_id = new.bill_id) then
    return new;
  end if;
  select coalesce(sum(amount), 0) into v_received from bill_payments where bill_id = new.bill_id and payment_method = new.refund_method;
  select coalesce(sum(total), 0) into v_refunded from returns where bill_id = new.bill_id and refund_method = new.refund_method and id <> new.id;
  if v_refunded + new.total > v_received + 0.005 then
    raise exception 'refund_exceeds_mode'
      using errcode = '22023',
            detail = jsonb_build_object('method', new.refund_method, 'received', v_received, 'refunded', v_refunded, 'asked', new.total)::text,
            hint = 'Refund in a mode the customer paid with, up to what was paid in it.';
  end if;
  return new;
end;
$$;

drop trigger if exists returns_refund_within_mode on public.returns;
create trigger returns_refund_within_mode
  before insert or update of refund_method, total on public.returns
  for each row execute function public.returns_refund_within_mode();

commit;

-- ─── Rollback (run by hand only if this release must be undone) ──────────────────
-- Deploy the previous app release first; it never reads or writes bill_payments. Then run the block
-- below. Dropping the table loses which modes split bills were paid in (each bill keeps its
-- payment_method — the mode that took the most — its paid_amount and credit_amount), so take a copy
-- of bill_payments first if it holds rows.
--
-- [rollback-start]
-- begin;
-- drop trigger if exists returns_refund_within_mode on public.returns;
-- drop function if exists public.returns_refund_within_mode();
-- drop trigger if exists bills_paid_guard on public.bills;
-- drop function if exists public.bills_paid_guard();
-- drop function if exists public.set_bill_payments(uuid, uuid, jsonb, uuid, numeric);
-- drop trigger if exists bill_payments_check on public.bill_payments;
-- drop function if exists public.bill_payments_check();
-- drop table if exists public.bill_payments;
-- commit;
-- [rollback-end]
--
-- Then: notify pgrst, 'reload schema';  and remove 0061_bill_payments from schema_migrations.
