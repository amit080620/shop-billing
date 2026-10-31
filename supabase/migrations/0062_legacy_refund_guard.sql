-- A refund in money never exceeds what the bill took in money — now also for bills without payment
-- rows (bills from before migration 0061, and bills that took no money: fully on udhaar, or paid with
-- old gold, a gold scheme or prepaid balance only).
--
-- Migration 0061's returns_refund_within_mode limited a money refund to what the bill's payment rows
-- took in that mode, and let a bill without rows through. The app checks those bills itself
-- (lib/billPaymentSplit refundRoom), but outside the database transaction: two returns of one old
-- bill saved at the same moment could each pass. This replaces the function, so the check runs
-- inside the transaction that saves the return, holding the bill's row:
--
-- 1. The bill's row is locked first (select … for update) — the row record_return (migration 0060)
--    and a void already hold — so returns of one bill are checked one after the other; a second
--    return waits for the first to commit and then counts it.
-- 2. A bill with payment rows: unchanged from 0061 — each mode up to what its rows took, less the
--    refunds already given in that mode.
-- 3. A bill without rows: its one mode (bills.payment_method) only, up to what it took in money —
--    paid_amount less old gold (jewellery_exchanges), a gold scheme used on it (its instalments,
--    plus the bonus once complete) and prepaid balance spent on it (wallet_entries) — less every
--    money refund the bill has had, in any mode (older returns could pick any).
-- 4. Udhaar adjustments ('credit_adjustment') are not money: not limited here, as before.
--
-- A return sent again with the same request id (returns.client_ref) is answered by record_return
-- from the return already saved; nothing is inserted, so this check does not run for it.
--
-- Additive: one function replaced (the trigger on returns is unchanged); no table, column or row
-- changes, and existing returns are not checked again. Rollback: see the end of this file.

begin;

create or replace function public.returns_refund_within_mode()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_method text;
  v_paid numeric;
  v_non_money numeric := 0;
  v_scheme record;
  v_amount numeric;
  v_received numeric;
  v_refunded numeric;
begin
  if new.refund_method not in ('cash', 'card', 'upi', 'online', 'other') then
    return new;
  end if;

  -- One return of this bill at a time (record_return holds the same row; for it this is a no-op).
  select payment_method, paid_amount into v_method, v_paid from bills where id = new.bill_id for update;
  if not found then
    return new; -- the foreign key refuses it
  end if;

  if exists (select 1 from bill_payments where bill_id = new.bill_id) then
    -- As in 0061: what the rows took in this mode.
    select coalesce(sum(amount), 0) into v_received from bill_payments where bill_id = new.bill_id and payment_method = new.refund_method;
    select coalesce(sum(total), 0) into v_refunded from returns where bill_id = new.bill_id and refund_method = new.refund_method and id <> new.id;
  else
    -- No rows: the bill's one mode, holding what it took in money.
    if to_regclass('public.jewellery_exchanges') is not null then
      execute 'select coalesce(sum(exchange_value), 0) from jewellery_exchanges where bill_id = $1' into v_amount using new.bill_id;
      v_non_money := v_non_money + coalesce(v_amount, 0);
    end if;
    if to_regclass('public.gold_schemes') is not null and to_regclass('public.gold_scheme_payments') is not null then
      for v_scheme in execute 'select id, installment_amount, total_installments, bonus_amount from gold_schemes where redeemed_bill_id = $1' using new.bill_id loop
        execute 'select coalesce(sum(amount), 0) from gold_scheme_payments where scheme_id = $1' into v_amount using v_scheme.id;
        v_non_money := v_non_money + v_amount
          + case when v_amount >= v_scheme.installment_amount * v_scheme.total_installments - 0.005 then v_scheme.bonus_amount else 0 end;
      end loop;
    end if;
    if to_regclass('public.wallet_entries') is not null then
      execute 'select coalesce(sum(-credit), 0) from wallet_entries where bill_id = $1 and kind = ''spend''' into v_amount using new.bill_id;
      v_non_money := v_non_money + coalesce(v_amount, 0);
    end if;
    v_received := case when new.refund_method = v_method then greatest(0, v_paid - least(greatest(v_non_money, 0), v_paid)) else 0 end;
    select coalesce(sum(total), 0) into v_refunded from returns
      where bill_id = new.bill_id and refund_method in ('cash', 'card', 'upi', 'online', 'other') and id <> new.id;
  end if;

  if v_refunded + new.total > v_received + 0.005 then
    raise exception 'refund_exceeds_mode'
      using errcode = '22023',
            detail = jsonb_build_object('method', new.refund_method, 'received', v_received, 'refunded', v_refunded, 'asked', new.total)::text,
            hint = 'Refund in a mode the customer paid with, up to what was paid in it.';
  end if;
  return new;
end;
$$;

commit;

-- ─── Rollback (run by hand only if this release must be undone) ──────────────────
-- Puts back 0061's function: bills without payment rows are again checked only by the app.
--
-- [rollback-start]
-- begin;
-- create or replace function public.returns_refund_within_mode()
-- returns trigger
-- language plpgsql
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_received numeric;
--   v_refunded numeric;
-- begin
--   if new.refund_method not in ('cash', 'card', 'upi', 'online', 'other') then
--     return new;
--   end if;
--   if not exists (select 1 from bill_payments where bill_id = new.bill_id) then
--     return new;
--   end if;
--   select coalesce(sum(amount), 0) into v_received from bill_payments where bill_id = new.bill_id and payment_method = new.refund_method;
--   select coalesce(sum(total), 0) into v_refunded from returns where bill_id = new.bill_id and refund_method = new.refund_method and id <> new.id;
--   if v_refunded + new.total > v_received + 0.005 then
--     raise exception 'refund_exceeds_mode'
--       using errcode = '22023',
--             detail = jsonb_build_object('method', new.refund_method, 'received', v_received, 'refunded', v_refunded, 'asked', new.total)::text,
--             hint = 'Refund in a mode the customer paid with, up to what was paid in it.';
--   end if;
--   return new;
-- end;
-- $$;
-- commit;
-- [rollback-end]
--
-- After applying (either way): notify pgrst, 'reload schema';  and add/remove 0062_legacy_refund_guard in schema_migrations.
