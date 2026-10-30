-- Stock never goes below zero from here on.
--
-- 1. A guard on products (and medicine batches): no new row below zero, and no change that takes a
--    stock below zero or further below it. Products already below zero (113 on 30 Oct 2026, all in the
--    FCMC SUPER MART demo/test account; S.S. MART had none) stay as they are; they can still be
--    edited, and their stock can be corrected upward (to zero or above, or just less negative), never
--    made worse.
-- 2. move_stock: the one way the app now takes stock off and puts it back. All of a bill's (or an
--    edit's, a count's, a void's) lines move together in one transaction, in the shop's own items only:
--    either every line moves or none does. Taking more than is in stock is refused with the item, what
--    is in stock and what was asked for — or, where the sale can't be refused (an offline bill already
--    handed over, a table already served, a count), stock stops at zero and the shortfall is returned
--    for the app to write down.
--    An item that isn't the shop's (deleted, or another shop's) refuses the whole move.
-- 2a. bill_items.stock_taken / stock_per_unit, take_bill_stock, edit_bill_stock: each bill line keeps
--    what it really took off the shelf (a short sale only what was there; nothing for an item not
--    counted at the sale), written in the same transaction as the move. Returns and voids put back
--    from that record, never from the item's settings today. Bills from before this release have no
--    record and keep the old rule. A medicine's line also keeps every batch it drew from and how much
--    (bill_item_batches): a void gives each batch back what came out of it, a return goes back to them
--    in turn, and nothing goes back to a batch twice. A bill edit (edit_bill_stock) moves the stock,
--    the batches and the recipe's raw materials by that record, and writes the lines and the bill's
--    totals with them, in one transaction: all of it or none. A dish sold by its recipe takes its raw
--    materials in the sale's own transaction too (take_bill_stock), written in the kitchen's ledger,
--    and its line is marked (recipe_sale) — never guessed later from today's recipes.
-- 2b. give_back_return / void_bill_stock, and return_items.stock_back: a return's lines go back once
--    (retries and double calls move nothing more), and a return and a void of the same bill give the
--    same goods back once, even at the same moment. A bill with a return adjusted against udhaar
--    can't be voided. A void puts back the counted lines, the medicine batches and the dishes' raw
--    materials (what really came off, from the kitchen's ledger) in one transaction.
-- 2c. record_return: a whole return (credit note, lines, goods back, udhaar adjustment) in one
--    transaction holding the bill — never more returned than sold, nothing against a voided bill, and
--    the same request (returns.client_ref) saved once.
-- 3. decrement_stock / increment_stock (still called by the app until this release is deployed) refuse
--    a missing, zero or negative quantity; decrement_stock refuses to take more than is in stock
--    instead of quietly stopping at zero. Only the server (service role) may call them.
-- 4. Settings → Stock "Don't bill more than stock" is on by default. Shops that never chose are turned
--    on; a choice is recorded from now on (block_oversell_chosen_at) and never overwritten. A shop
--    can still switch it off; it then bills on and stock stops at zero, written down.
--
-- Run it before deploying the release that calls move_stock. Rollback: see the end of this file.

begin;

-- ─── 1. The guard ─────────────────────────────────────────────────────────────

create or replace function public.stock_not_below_zero()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new numeric := (to_jsonb(new) ->> tg_argv[0])::numeric;
  v_old numeric := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> tg_argv[0])::numeric end;
begin
  if v_new < 0 and (v_old is null or v_new < v_old) then
    raise exception 'negative_stock'
      using errcode = '23514',
            detail = jsonb_build_object('table', tg_table_name, 'id', new.id, 'before', v_old, 'after', v_new)::text,
            hint = 'Stock cannot go below zero. An item already below zero can only be corrected upward.';
  end if;
  return new;
end;
$$;

drop trigger if exists products_stock_not_below_zero on public.products;
create trigger products_stock_not_below_zero
  before insert or update of stock_quantity on public.products
  for each row execute function public.stock_not_below_zero('stock_quantity');

drop trigger if exists medicine_batches_stock_not_below_zero on public.medicine_batches;
create trigger medicine_batches_stock_not_below_zero
  before insert or update of quantity on public.medicine_batches
  for each row execute function public.stock_not_below_zero('quantity');

-- ─── 2. move_stock ────────────────────────────────────────────────────────────

-- p_take / p_give: [{"product_id": "…", "quantity": 2.5}, …]. Lines of the same item add up; an item
-- that is in both is moved by the difference. Items are locked in id order, so two bills sharing
-- items never wait on each other in a circle. Returns {"short": [{product_id, requested, available,
-- taken}]} — what an allowed shortfall left untaken (empty when everything was in stock).
create or replace function public.move_stock(
  p_shop_id uuid,
  p_take jsonb default '[]'::jsonb,
  p_give jsonb default '[]'::jsonb,
  p_allow_short boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
  v_stock numeric;
  v_taken numeric;
  v_short jsonb := '[]'::jsonb;
begin
  if p_shop_id is null then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'shop is required';
  end if;
  if jsonb_typeof(coalesce(p_take, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_give, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'take and give must be lists';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_take, '[]'::jsonb) || coalesce(p_give, '[]'::jsonb)) e
    where jsonb_typeof(e -> 'quantity') is distinct from 'number'
       or (e ->> 'quantity')::numeric <= 0
       or nullif(e ->> 'product_id', '') is null
  ) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'every line needs an item and a quantity greater than 0';
  end if;

  for r in
    select product_id, sum(delta) as delta
    from (
      select (e ->> 'product_id')::uuid as product_id, -((e ->> 'quantity')::numeric) as delta
      from jsonb_array_elements(coalesce(p_take, '[]'::jsonb)) e
      union all
      select (e ->> 'product_id')::uuid, (e ->> 'quantity')::numeric
      from jsonb_array_elements(coalesce(p_give, '[]'::jsonb)) e
    ) lines
    group by product_id
    having sum(delta) <> 0
    order by product_id
  loop
    select stock_quantity into v_stock
    from products
    where id = r.product_id and shop_id = p_shop_id
    for update;
    -- Not this shop's item, or deleted since: the whole move is refused (nothing moves), never
    -- skipped — a bill can't go through with one of its items quietly left out.
    if not found then
      raise exception 'unknown_item'
        using errcode = 'P0002',
              detail = jsonb_build_object('product_id', r.product_id)::text,
              hint = 'The item is not in this shop''s list (deleted, or another shop''s).';
    end if;

    if r.delta > 0 then
      update products set stock_quantity = stock_quantity + r.delta where id = r.product_id;
    elsif v_stock >= -r.delta then
      update products set stock_quantity = stock_quantity + r.delta where id = r.product_id;
    elsif p_allow_short then
      v_taken := greatest(v_stock, 0);
      if v_taken > 0 then
        update products set stock_quantity = stock_quantity - v_taken where id = r.product_id;
      end if;
      v_short := v_short || jsonb_build_object('product_id', r.product_id, 'requested', -r.delta, 'available', v_stock, 'taken', v_taken);
    else
      raise exception 'insufficient_stock'
        using errcode = 'P0001',
              detail = jsonb_build_object('product_id', r.product_id, 'requested', -r.delta, 'available', v_stock)::text;
    end if;
  end loop;

  return jsonb_build_object('short', v_short);
end;
$$;

-- Only the app's server (service role) moves stock.
revoke all on function public.move_stock(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.move_stock(uuid, jsonb, jsonb, boolean) to service_role;

-- ─── 2a. Each bill line remembers what it took off the shelf ──────────────────────────
-- A return or a void puts back what the sale took — not what the item's settings say today. The owner
-- may switch "count stock" on or off after the sale, a short sale (offline, a shop that bills past its
-- stock) may have taken less than it sold, a loose tablet takes a tenth of a strip, and a delivery
-- challan may have taken the goods before the bill. So the bill line keeps it:
--   stock_taken    — how much of the item's stock (in its stock unit) the line has out: what the sale
--                    really took (only what was there, when a short sale stopped at zero) plus what
--                    its delivery challan had already taken, changed by every quantity edit since.
--                    What its returns put back is in return_items.stock_back. 0: nothing (an item not
--                    counted at the sale, a dish sold by its recipe, a service).
--                    Null: a bill made before this release. Nothing is guessed for it: it keeps the
--                    old rule (the item's own setting at the time of the return or void).
--   stock_per_unit — the item's stock units per unit sold, as sold (1; 0.1 for a tablet of a strip of
--                    10). 0 when nothing was counted.
--   recipe_sale    — the line is a dish sold by its recipe: its raw materials were taken (and written in
--                    kitchen_usage), not the dish itself. Set by the sale (and an edit that changes the
--                    line's item) — never guessed later from today's recipes.
alter table public.bill_items add column if not exists stock_taken numeric(12, 3);
alter table public.bill_items add column if not exists stock_per_unit numeric(12, 6);
alter table public.bill_items add column if not exists recipe_sale boolean not null default false;
-- And each raw material a recipe took for a sale: what really came off (a short one stops at zero).
-- Null: written before this release — its quantity went back on a void, as before.
alter table if exists public.kitchen_usage add column if not exists stock_taken numeric(12, 4);

-- And each medicine batch a bill line drew from: one row per batch, in the order they were drawn
-- (earliest expiry first — FEFO), with what came out of it (quantity) and how much of that has gone
-- back to it since (back: returns and the void; never more than quantity). A sale that drew from
-- several batches keeps all of them, not just the first (bill_items.batch_id stays the first one,
-- for the printed bill). Written with the sale's own stock move (take_bill_stock); a batch something
-- was sold from can't be deleted (it is written off instead), as with bill_items.batch_id.
create table if not exists public.bill_item_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  bill_item_id uuid not null references public.bill_items(id) on delete cascade,
  batch_id uuid not null references public.medicine_batches(id),
  seq integer not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  back numeric(12, 3) not null default 0 check (back >= 0 and back <= quantity),
  created_at timestamptz not null default now(),
  unique (bill_item_id, seq)
);
create index if not exists idx_bill_item_batches_batch on public.bill_item_batches (batch_id);
-- Read and written only by the server (service role), like every other table.
alter table public.bill_item_batches enable row level security;

-- A new bill's stock: taken, and written on its lines, in one go, holding the bill. p_lines: the lines
-- counted in stock now — [{"bill_item_id", "quantity", "covered", "per_unit"}]: quantity = what to take
-- now (stock units; 0 when its challan took it all), covered = what the line's delivery challan
-- already took, per_unit = stock units per unit sold. Each line must be this bill's, of this shop's
-- counted item, named once. Every other line of the bill is written as having taken nothing. Once per
-- bill. Returns move_stock's {"short": […]}.
-- A medicine (is_pharma) also comes out of its batches here: what the line took (with its challan's
-- share — a challan moves the item's stock, not its batches), from this shop's batches of the item
-- that aren't expired (by today's date in India), earliest expiry first, each batch locked and never
-- below zero; every batch drawn from is written in bill_item_batches. Where the batches hold less
-- than the line took, they give what they have (the item and its batches already disagreed).
-- p_dishes: [{"bill_item_id"}] — the lines that are dishes sold by their recipe (not in p_lines: the
-- dish itself isn't taken). Their raw materials come off here too, in the same transaction: each
-- recipe times the plates on the line, added up per raw material, stopping at zero where one runs
-- short (the food is made — written down, as before), and written in the kitchen's ledger
-- (kitchen_usage: what the recipes used, and what really came off). The lines are marked recipe_sale.
create or replace function public.take_bill_stock(p_shop_id uuid, p_bill_id uuid, p_lines jsonb, p_allow_short boolean default false, p_dishes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_dishes jsonb := coalesce(p_dishes, '[]'::jsonb);
  v_raw jsonb;
  v_raw_short jsonb := '[]'::jsonb;
  v_bad uuid;
  v_take jsonb;
  v_short jsonb;
  v_product uuid;
  v_missing numeric := 0;
  v_cut numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_rest numeric;
  v_put numeric;
  v_seq integer;
  v_first uuid;
  r record;
  b record;
begin
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'lines must be a list';
  end if;
  perform 1 from bills where id = p_bill_id and shop_id = p_shop_id and status = 'active' for update;
  if not found then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'bill not found';
  end if;
  if exists (select 1 from bill_items where bill_id = p_bill_id and stock_taken is not null) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'this bill''s stock was already taken';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_lines) e
    left join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
    where bi.id is null
       or bi.product_id is null
       or jsonb_typeof(e -> 'quantity') is distinct from 'number' or (e ->> 'quantity')::numeric < 0
       or jsonb_typeof(e -> 'covered') is distinct from 'number' or (e ->> 'covered')::numeric < 0
       or jsonb_typeof(e -> 'per_unit') is distinct from 'number' or (e ->> 'per_unit')::numeric <= 0
       or (e ->> 'quantity')::numeric + (e ->> 'covered')::numeric <= 0
  ) or (
    select count(*) <> count(distinct e ->> 'bill_item_id') from jsonb_array_elements(v_lines) e
  ) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line is not this bill''s, is named twice, or has no quantity';
  end if;
  -- Only this shop's items, counted in stock right now (the moment of the sale).
  select bi.product_id into v_bad
  from jsonb_array_elements(v_lines) e
  join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
  left join products p on p.id = bi.product_id and p.shop_id = p_shop_id
  where p.id is null
  limit 1;
  if found then
    raise exception 'unknown_item'
      using errcode = 'P0002',
            detail = jsonb_build_object('product_id', v_bad)::text,
            hint = 'The item is not in this shop''s list (deleted, or another shop''s).';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_lines) e
    join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
    join products p on p.id = bi.product_id and p.shop_id = p_shop_id
    where not p.track_inventory
  ) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line''s item is not counted in stock';
  end if;
  -- The dishes: each this bill's line, named once, not also a counted line, of this shop's item with a recipe.
  if jsonb_typeof(v_dishes) <> 'array' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'dishes must be a list';
  end if;
  if jsonb_array_length(v_dishes) > 0 then
    if to_regclass('public.kitchen_usage') is null or to_regclass('public.recipe_lines') is null then
      raise exception 'invalid_stock_move' using errcode = '22023', detail = 'recipes are not set up';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_dishes) e
      left join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
      left join products p on p.id = bi.product_id and p.shop_id = p_shop_id
      where bi.id is null
         or p.id is null
         or not exists (select 1 from recipe_lines rl where rl.dish_id = bi.product_id and rl.shop_id = p_shop_id)
         or exists (select 1 from jsonb_array_elements(v_lines) c where c ->> 'bill_item_id' = e ->> 'bill_item_id')
    ) or (
      select count(*) <> count(distinct e ->> 'bill_item_id') from jsonb_array_elements(v_dishes) e
    ) then
      raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a dish line is not this bill''s, is named twice, is also counted, or has no recipe';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', bi.product_id, 'quantity', (e ->> 'quantity')::numeric)), '[]'::jsonb)
  into v_take
  from jsonb_array_elements(v_lines) e
  join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
  where (e ->> 'quantity')::numeric > 0;
  v_short := coalesce(public.move_stock(p_shop_id, v_take, '[]'::jsonb, p_allow_short) -> 'short', '[]'::jsonb);

  -- What each line really took: a short item's shortfall comes off its lines in turn.
  for r in
    select bi.id, bi.product_id, p.is_pharma, (e ->> 'quantity')::numeric as qty, (e ->> 'covered')::numeric as covered, (e ->> 'per_unit')::numeric as per_unit
    from jsonb_array_elements(v_lines) e
    join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
    join products p on p.id = bi.product_id and p.shop_id = p_shop_id
    order by bi.product_id, bi.id
  loop
    if v_product is distinct from r.product_id then
      v_product := r.product_id;
      select coalesce(sum((s ->> 'requested')::numeric - (s ->> 'taken')::numeric), 0) into v_missing
      from jsonb_array_elements(v_short) s
      where s ->> 'product_id' = r.product_id::text;
    end if;
    v_cut := least(r.qty, v_missing);
    v_missing := v_missing - v_cut;
    update bill_items set stock_taken = r.covered + r.qty - v_cut, stock_per_unit = r.per_unit where id = r.id;

    -- A medicine: out of its batches, earliest expiry first, each one written down.
    if r.is_pharma then
      v_rest := r.covered + r.qty - v_cut;
      v_seq := 0;
      v_first := null;
      for b in
        select mb.id, mb.quantity
        from medicine_batches mb
        where mb.shop_id = p_shop_id and mb.product_id = r.product_id and mb.quantity > 0
          and (mb.expiry_date is null or mb.expiry_date >= v_today)
        order by mb.expiry_date asc nulls last, mb.id
        for update
      loop
        exit when v_rest <= 0;
        v_put := least(v_rest, b.quantity);
        update medicine_batches set quantity = quantity - v_put where id = b.id;
        v_seq := v_seq + 1;
        insert into bill_item_batches (shop_id, bill_item_id, batch_id, seq, quantity) values (p_shop_id, r.id, b.id, v_seq, v_put);
        v_first := coalesce(v_first, b.id);
        v_rest := v_rest - v_put;
      end loop;
      if v_first is not null then
        update bill_items set batch_id = v_first where id = r.id;
      end if;
    end if;
  end loop;
  update bill_items set stock_taken = 0, stock_per_unit = 0 where bill_id = p_bill_id and stock_taken is null;

  -- The dishes' raw materials: by their recipes, added up per raw material, stopping at zero where one
  -- runs short, and written in the kitchen's ledger with what really came off.
  if jsonb_array_length(v_dishes) > 0 then
    update bill_items set recipe_sale = true
    where bill_id = p_bill_id and id::text in (select e ->> 'bill_item_id' from jsonb_array_elements(v_dishes) e);
    select coalesce(jsonb_agg(jsonb_build_object('product_id', x.ingredient, 'used', x.used, 'quantity', round(x.used, 3))), '[]'::jsonb)
    into v_raw
    from (
      select rl.ingredient_id as ingredient, round(sum(rl.quantity * bi.quantity), 4) as used
      from jsonb_array_elements(v_dishes) e
      join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
      join recipe_lines rl on rl.dish_id = bi.product_id and rl.shop_id = p_shop_id
      group by rl.ingredient_id
    ) x
    where x.used > 0;
    v_take := coalesce((select jsonb_agg(jsonb_build_object('product_id', t ->> 'product_id', 'quantity', (t ->> 'quantity')::numeric)) from jsonb_array_elements(v_raw) t where (t ->> 'quantity')::numeric > 0), '[]'::jsonb);
    v_raw_short := coalesce(public.move_stock(p_shop_id, v_take, '[]'::jsonb, true) -> 'short', '[]'::jsonb);
    insert into kitchen_usage (shop_id, ingredient_id, kind, quantity, bill_id, staff_id, stock_taken)
    select p_shop_id, (t ->> 'product_id')::uuid, 'sale', (t ->> 'used')::numeric, p_bill_id, (select staff_id from bills where id = p_bill_id),
           greatest((t ->> 'quantity')::numeric - coalesce((select sum((s ->> 'requested')::numeric - (s ->> 'taken')::numeric) from jsonb_array_elements(v_raw_short) s where s ->> 'product_id' = t ->> 'product_id'), 0), 0)
    from jsonb_array_elements(v_raw) t;
  end if;
  return jsonb_build_object('short', v_short || v_raw_short);
end;
$$;

-- A bill edit, whole, in one transaction holding the bill: the stock it moves, the medicine batches,
-- the recipe's raw materials, every line and the bill's totals — all written, or (anything refused or
-- failing) none. p_lines: the lines to rewrite — [{"bill_item_id", "quantity", "line_subtotal",
-- "cgst_amount", "sgst_amount", "igst_amount", "line_gst", "line_total"}], and to change a line's item
-- also "product_id", "per_unit" (its stock units per unit sold), "product_name", "unit_price",
-- "gst_percent", "hsn_code". p_bill: the bill's new figures — {"subtotal", "discount_amount",
-- "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount", "gst_amount", "round_off_amount",
-- "total", "paid_amount", "credit_amount"} — and "edited_by", "edit_reason".
--
-- A bill from this release moves by its record, never by the item's setting today:
--   • a counted line: its stock moves by the change times its stock per unit — more taken where it
--     went up (where a short sale is allowed, only what is there), some put back where it went down,
--     never more than the line still has out (what it took less what its returns put back). A line
--     that took nothing at the sale moves nothing.
--   • a medicine: more taken comes out of this shop's batches that aren't expired, earliest expiry
--     first, each written down; put back goes to the batches it drew from, the latest drawn first
--     (the edit undoes the most recent draw), never more than each gave less what returns put back
--     to it. The batch record shrinks with it: the sale drew less.
--   • a dish sold by its recipe (the sale marked it: recipe_sale): its raw materials move by the
--     change times today's recipe — more taken (stopping at zero, written down, as at the sale), or
--     put back from the bill's recorded usage, newest first, never more than it recorded as taken. Each raw material's change is netted over the whole edit,
--     so nothing is taken and put back, or put back twice.
--   • a line's item changed (a line with no returns): the old item's stock (and batches, and raw
--     materials) all go back, and the new item is taken as a new sale of it — counted, a medicine or
--     a dish by what it is now.
-- A bill from before this release has no record: it moves the old way (the change in quantity of
-- the items counted in stock today, not a dish sold by its recipe; batches and raw materials don't
-- move) — but now in one go with the bill. Its items can't be changed.
-- No line goes below what its returns already took back (below_returned, nothing changes).
-- {"result": "ok", "short": […]} · {"result": "voided"}.
create or replace function public.edit_bill_stock(p_shop_id uuid, p_bill_id uuid, p_lines jsonb, p_bill jsonb, p_allow_short boolean default false)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_bill jsonb := coalesce(p_bill, '{}'::jsonb);
  v_status text;
  v_legacy boolean;
  v_kitchen boolean := to_regclass('public.kitchen_usage') is not null and to_regclass('public.recipe_lines') is not null;
  v_recipe_bill boolean := false;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_staff uuid;
  v_plan jsonb := '[]'::jsonb;
  v_raw jsonb := '[]'::jsonb;
  v_take jsonb;
  v_give jsonb;
  v_short jsonb;
  v_raw_short jsonb := '[]'::jsonb;
  v_changed boolean;
  v_new_dish boolean;
  v_new_product uuid;
  v_new_unit numeric;
  v_take_q numeric;
  v_give_q numeric;
  v_got numeric;
  v_product uuid;
  v_missing numeric := 0;
  v_cut numeric;
  v_rest numeric;
  v_put numeric;
  v_back numeric;
  v_given numeric;
  v_seq integer;
  r record;
  l record;
  b record;
begin
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_bill) <> 'object' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'lines must be a list, the bill an object';
  end if;
  select status into v_status from bills where id = p_bill_id and shop_id = p_shop_id for update;
  if not found then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'bill not found';
  end if;
  if v_status is distinct from 'active' then
    return jsonb_build_object('result', 'voided');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_lines) e
    left join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
    where bi.id is null
       or jsonb_typeof(e -> 'quantity') is distinct from 'number' or (e ->> 'quantity')::numeric <= 0
       or exists (select 1 from unnest(array['line_subtotal', 'cgst_amount', 'sgst_amount', 'igst_amount', 'line_gst', 'line_total']) k where jsonb_typeof(e -> k) is distinct from 'number')
  ) or (
    select count(*) <> count(distinct e ->> 'bill_item_id') from jsonb_array_elements(v_lines) e
  ) or exists (
    select 1 from unnest(array['subtotal', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'gst_amount', 'round_off_amount', 'total', 'paid_amount', 'credit_amount']) k
    where jsonb_typeof(v_bill -> k) is distinct from 'number'
  ) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line is not this bill''s, is named twice, or a quantity or figure is missing';
  end if;
  v_staff := nullif(v_bill ->> 'edited_by', '')::uuid;
  v_legacy := exists (select 1 from bill_items where bill_id = p_bill_id and stock_taken is null);
  if v_kitchen then
    v_recipe_bill := exists (select 1 from kitchen_usage ku where ku.bill_id = p_bill_id and ku.shop_id = p_shop_id and (v_legacy or ku.stock_taken is not null));
  end if;

  -- 1. What each line moves (nothing written yet).
  for r in
    select e.v, bi.id, bi.product_id, bi.quantity as old_qty, bi.stock_taken, coalesce(bi.stock_per_unit, 0) as unit,
           (e.v ->> 'quantity')::numeric as qty,
           nullif(e.v ->> 'product_id', '')::uuid as asked,
           coalesce((select sum(ri.quantity) from return_items ri where ri.bill_item_id = bi.id), 0) as returned,
           coalesce((select sum(coalesce(ri.stock_back, ri.quantity)) from return_items ri where ri.bill_item_id = bi.id), 0) as put_back,
           p.track_inventory as tracked_now,
           -- A dish sold by its recipe: as the sale marked it (recipe_sale), never guessed from today's recipes.
           v_kitchen and bi.stock_taken is not null and bi.recipe_sale and bi.product_id is not null as dish
    from jsonb_array_elements(v_lines) e(v)
    join bill_items bi on bi.id::text = e.v ->> 'bill_item_id' and bi.bill_id = p_bill_id
    left join products p on p.id = bi.product_id and p.shop_id = p_shop_id
  loop
    if r.qty < r.returned then
      raise exception 'below_returned'
        using errcode = '22023',
              detail = jsonb_build_object('bill_item_id', r.id, 'returned', r.returned)::text,
              hint = 'A line can''t go below what its returns already took back.';
    end if;
    v_changed := r.asked is not null and r.asked is distinct from r.product_id;
    v_new_product := r.product_id;
    v_new_unit := r.unit;
    v_new_dish := r.dish;
    v_take_q := 0;
    v_give_q := 0;
    if v_changed then
      if v_legacy then
        raise exception 'invalid_stock_move' using errcode = '22023', detail = 'an item can be changed only on a bill made from this release';
      end if;
      if r.returned > 0 then
        raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line with returns can''t change its item';
      end if;
      if not exists (select 1 from products where id = r.asked and shop_id = p_shop_id) then
        raise exception 'unknown_item'
          using errcode = 'P0002', detail = jsonb_build_object('product_id', r.asked)::text, hint = 'The item is not in this shop''s list.';
      end if;
      v_new_product := r.asked;
      -- The old item: everything it has out goes back (a dish: its raw materials).
      if r.product_id is not null then v_give_q := r.stock_taken; end if;
      if r.dish then
        v_raw := v_raw || (select coalesce(jsonb_agg(jsonb_build_object('product_id', rl.ingredient_id, 'quantity', -round(rl.quantity * r.old_qty, 4))), '[]'::jsonb) from recipe_lines rl where rl.dish_id = r.product_id and rl.shop_id = p_shop_id);
      end if;
      -- The new item, as a new sale of it.
      if v_kitchen and exists (select 1 from recipe_lines rl where rl.dish_id = r.asked and rl.shop_id = p_shop_id) then
        v_raw := v_raw || (select coalesce(jsonb_agg(jsonb_build_object('product_id', rl.ingredient_id, 'quantity', round(rl.quantity * r.qty, 4))), '[]'::jsonb) from recipe_lines rl where rl.dish_id = r.asked and rl.shop_id = p_shop_id);
        v_new_unit := 0;
        v_new_dish := true;
      elsif (select track_inventory from products where id = r.asked) then
        if jsonb_typeof(r.v -> 'per_unit') is distinct from 'number' or (r.v ->> 'per_unit')::numeric <= 0 then
          raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a changed item needs its stock per unit sold';
        end if;
        v_new_unit := (r.v ->> 'per_unit')::numeric;
        v_take_q := round(r.qty * v_new_unit, 3);
        v_new_dish := false;
      else
        v_new_unit := 0;
        v_new_dish := false;
      end if;
    elsif v_legacy then
      -- The old rule: the items counted in stock today, not a dish sold by its recipe; by the change.
      if r.product_id is not null and coalesce(r.tracked_now, false)
         and not (v_recipe_bill and exists (select 1 from recipe_lines rl where rl.dish_id = r.product_id and rl.shop_id = p_shop_id)) then
        if r.qty > r.old_qty then v_take_q := r.qty - r.old_qty; else v_give_q := r.old_qty - r.qty; end if;
      end if;
    elsif r.dish then
      if r.qty <> r.old_qty then
        v_raw := v_raw || (select coalesce(jsonb_agg(jsonb_build_object('product_id', rl.ingredient_id, 'quantity', round(rl.quantity * (r.qty - r.old_qty), 4))), '[]'::jsonb) from recipe_lines rl where rl.dish_id = r.product_id and rl.shop_id = p_shop_id);
      end if;
    elsif r.unit > 0 and r.product_id is not null then
      if r.qty >= r.old_qty then
        v_take_q := round((r.qty - r.old_qty) * r.unit, 3);
      else
        v_give_q := least(round((r.old_qty - r.qty) * r.unit, 3), greatest(r.stock_taken - r.put_back, 0));
      end if;
    end if;
    v_plan := v_plan || jsonb_build_object('id', r.id, 'old_product', r.product_id, 'product', v_new_product, 'take', v_take_q, 'give', coalesce(v_give_q, 0), 'unit', v_new_unit, 'changed', v_changed, 'dish', coalesce(v_new_dish, false));
  end loop;

  -- 2. The items' stock, all lines in one move (refused as a whole where it can't be).
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p ->> 'product', 'quantity', (p ->> 'take')::numeric)) filter (where (p ->> 'take')::numeric > 0), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('product_id', p ->> 'old_product', 'quantity', (p ->> 'give')::numeric)) filter (where (p ->> 'give')::numeric > 0), '[]'::jsonb)
  into v_take, v_give
  from jsonb_array_elements(v_plan) p;
  v_short := coalesce(public.move_stock(p_shop_id, v_take, v_give, p_allow_short) -> 'short', '[]'::jsonb);

  -- 3. Each line's record and its batches.
  for l in
    select (p ->> 'id')::uuid as id, (p ->> 'product')::uuid as product, (p ->> 'take')::numeric as take, (p ->> 'give')::numeric as give,
           (p ->> 'unit')::numeric as unit, (p ->> 'changed')::boolean as changed, (p ->> 'dish')::boolean as dish
    from jsonb_array_elements(v_plan) p
    order by p ->> 'product', p ->> 'id'
  loop
    if v_product is distinct from l.product then
      v_product := l.product;
      select coalesce(sum((s ->> 'requested')::numeric - (s ->> 'taken')::numeric), 0) into v_missing
      from jsonb_array_elements(v_short) s
      where s ->> 'product_id' = l.product::text;
    end if;
    v_cut := least(l.take, coalesce(v_missing, 0));
    v_missing := coalesce(v_missing, 0) - v_cut;
    v_got := l.take - v_cut;
    if v_legacy then
      continue;
    end if;

    -- Put back: to the batches it drew from, the latest drawn first, as much as each still has out.
    if l.changed then
      update medicine_batches mb set quantity = mb.quantity + (bib.quantity - bib.back)
      from bill_item_batches bib
      where bib.bill_item_id = l.id and mb.id = bib.batch_id and mb.shop_id = p_shop_id and bib.back < bib.quantity;
      delete from bill_item_batches where bill_item_id = l.id;
    elsif l.give > 0 then
      v_rest := l.give;
      for b in
        select id, batch_id, quantity - back as open from bill_item_batches
        where bill_item_id = l.id and shop_id = p_shop_id and back < quantity
        order by seq desc
        for update
      loop
        exit when v_rest <= 0;
        v_put := least(v_rest, b.open);
        update medicine_batches set quantity = quantity + v_put where id = b.batch_id and shop_id = p_shop_id;
        update bill_item_batches set quantity = quantity - v_put where id = b.id and quantity - v_put > 0;
        if not found then delete from bill_item_batches where id = b.id; end if;
        v_rest := v_rest - v_put;
      end loop;
    end if;
    -- Taken: a medicine out of its batches, earliest expiry first, each written down.
    if v_got > 0 and (select is_pharma from products where id = l.product) then
      select coalesce(max(seq), 0) into v_seq from bill_item_batches where bill_item_id = l.id;
      v_rest := v_got;
      for b in
        select mb.id, mb.quantity from medicine_batches mb
        where mb.shop_id = p_shop_id and mb.product_id = l.product and mb.quantity > 0
          and (mb.expiry_date is null or mb.expiry_date >= v_today)
        order by mb.expiry_date asc nulls last, mb.id
        for update
      loop
        exit when v_rest <= 0;
        v_put := least(v_rest, b.quantity);
        update medicine_batches set quantity = quantity - v_put where id = b.id;
        v_seq := v_seq + 1;
        insert into bill_item_batches (shop_id, bill_item_id, batch_id, seq, quantity) values (p_shop_id, l.id, b.id, v_seq, v_put);
        v_rest := v_rest - v_put;
      end loop;
    end if;
    update bill_items
    set stock_taken = case when l.changed then v_got else stock_taken + v_got - l.give end,
        stock_per_unit = l.unit,
        recipe_sale = l.dish,
        batch_id = coalesce((select bib.batch_id from bill_item_batches bib where bib.bill_item_id = l.id order by bib.seq limit 1), case when l.changed then null else batch_id end)
    where id = l.id;
  end loop;

  -- 4. The recipes' raw materials, netted per raw material over the whole edit.
  if v_kitchen and not v_legacy and jsonb_array_length(v_raw) > 0 then
    -- More used: taken (stopping at zero, written down, as at the sale) and recorded.
    select coalesce(jsonb_agg(jsonb_build_object('product_id', x.ingredient, 'quantity', round(x.net, 3))), '[]'::jsonb)
    into v_take
    from (select (e ->> 'product_id')::uuid as ingredient, sum((e ->> 'quantity')::numeric) as net from jsonb_array_elements(v_raw) e group by 1) x
    where round(x.net, 3) > 0;
    if jsonb_array_length(v_take) > 0 then
      v_raw_short := coalesce(public.move_stock(p_shop_id, v_take, '[]'::jsonb, true) -> 'short', '[]'::jsonb);
      insert into kitchen_usage (shop_id, ingredient_id, kind, quantity, bill_id, staff_id, stock_taken)
      select p_shop_id, (t ->> 'product_id')::uuid, 'sale', (t ->> 'quantity')::numeric, p_bill_id, v_staff,
             (t ->> 'quantity')::numeric - coalesce((select sum((s ->> 'requested')::numeric - (s ->> 'taken')::numeric) from jsonb_array_elements(v_raw_short) s where s ->> 'product_id' = t ->> 'product_id'), 0)
      from jsonb_array_elements(v_take) t;
    end if;
    -- Less used: the bill's recorded usage shrinks, newest first, and what it had really taken goes back.
    v_give := '[]'::jsonb;
    for r in
      select x.ingredient, round(-x.net, 3) as need
      from (select (e ->> 'product_id')::uuid as ingredient, sum((e ->> 'quantity')::numeric) as net from jsonb_array_elements(v_raw) e group by 1) x
      where round(x.net, 3) < 0
      order by x.ingredient
    loop
      v_rest := r.need;
      v_given := 0;
      for b in
        select id, quantity, stock_taken from kitchen_usage
        where bill_id = p_bill_id and shop_id = p_shop_id and kind = 'sale' and ingredient_id = r.ingredient and stock_taken is not null
        order by created_at desc, id desc
        for update
      loop
        exit when v_rest <= 0;
        v_put := least(v_rest, b.quantity);
        v_back := least(b.stock_taken, v_put);
        if v_put >= b.quantity then
          delete from kitchen_usage where id = b.id;
        else
          update kitchen_usage set quantity = quantity - v_put, stock_taken = stock_taken - v_back where id = b.id;
        end if;
        v_given := v_given + v_back;
        v_rest := v_rest - v_put;
      end loop;
      if round(v_given, 3) > 0 then
        v_give := v_give || jsonb_build_object('product_id', r.ingredient, 'quantity', round(v_given, 3));
      end if;
    end loop;
    if jsonb_array_length(v_give) > 0 then
      perform public.move_stock(p_shop_id, '[]'::jsonb, v_give, false);
    end if;
  end if;

  -- 5. The lines and the bill.
  update bill_items bi
  set quantity = (e ->> 'quantity')::numeric,
      line_subtotal = (e ->> 'line_subtotal')::numeric,
      cgst_amount = (e ->> 'cgst_amount')::numeric,
      sgst_amount = (e ->> 'sgst_amount')::numeric,
      igst_amount = (e ->> 'igst_amount')::numeric,
      line_gst = (e ->> 'line_gst')::numeric,
      line_total = (e ->> 'line_total')::numeric,
      product_id = coalesce(nullif(e ->> 'product_id', '')::uuid, bi.product_id),
      product_name = case when e ->> 'product_id' is not null and (e ->> 'product_id')::uuid is distinct from bi.product_id then coalesce(e ->> 'product_name', bi.product_name) else bi.product_name end,
      unit_price = case when e ->> 'product_id' is not null and (e ->> 'product_id')::uuid is distinct from bi.product_id then coalesce((e ->> 'unit_price')::numeric, bi.unit_price) else bi.unit_price end,
      gst_percent = case when e ->> 'product_id' is not null and (e ->> 'product_id')::uuid is distinct from bi.product_id then coalesce((e ->> 'gst_percent')::numeric, bi.gst_percent) else bi.gst_percent end,
      hsn_code = case when e ->> 'product_id' is not null and (e ->> 'product_id')::uuid is distinct from bi.product_id then e ->> 'hsn_code' else bi.hsn_code end
  from jsonb_array_elements(v_lines) e
  where bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id;

  update bills
  set subtotal = (v_bill ->> 'subtotal')::numeric,
      discount_amount = (v_bill ->> 'discount_amount')::numeric,
      taxable_amount = (v_bill ->> 'taxable_amount')::numeric,
      cgst_amount = (v_bill ->> 'cgst_amount')::numeric,
      sgst_amount = (v_bill ->> 'sgst_amount')::numeric,
      igst_amount = (v_bill ->> 'igst_amount')::numeric,
      gst_amount = (v_bill ->> 'gst_amount')::numeric,
      round_off_amount = (v_bill ->> 'round_off_amount')::numeric,
      total = (v_bill ->> 'total')::numeric,
      paid_amount = (v_bill ->> 'paid_amount')::numeric,
      credit_amount = (v_bill ->> 'credit_amount')::numeric,
      edited_at = now(),
      edited_by = v_staff,
      edit_reason = nullif(v_bill ->> 'edit_reason', '')
  where id = p_bill_id;

  return jsonb_build_object('result', 'ok', 'short', v_short || v_raw_short);
end;
$$;

revoke all on function public.take_bill_stock(uuid, uuid, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.take_bill_stock(uuid, uuid, jsonb, boolean, jsonb) to service_role;
revoke all on function public.edit_bill_stock(uuid, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.edit_bill_stock(uuid, uuid, jsonb, jsonb, boolean) to service_role;

-- ─── 2b. Returns and voids give stock back once ─────────────────────────────────────
-- A return's goods and a void's goods go back on the shelf only while holding the bill's row (the
-- void's update, the return's select … for update), so the two can't overlap: a void gives back each
-- line less what its returns already gave back, and a return against a bill voided meanwhile gives
-- back nothing (the void gave back everything).

-- How much of a returned line went back on the shelf. Null on returns made before this release: they
-- all went back then.
alter table public.return_items add column if not exists stock_back numeric(12, 3);

-- For a return saved step by step (the app's way before record_return): its lines whose goods haven't
-- gone back yet (stock_back = 0). p_lines: [{"return_item_id", …}] — which of them to put back. Each
-- goes back once, by what the sale's record says (never the caller's numbers): for a bill line from
-- this release, the returned quantity times its stock per unit, never more than the line still has
-- out — nothing for a line that took nothing at the sale; for a line from before this release (no
-- record), the returned quantity if the item is counted in stock today. All in one go, then marked.
-- Called again (a retry, a double tap, two at once — they queue on the bill's row): nothing more moves.
-- A return recorded whole by record_return (it has its request id) put its goods back as it was saved:
-- nothing is waiting.
-- 'ok', or 'voided' (the bill was voided meanwhile: nothing moved — the void gave everything back).
create or replace function public.give_back_return(p_shop_id uuid, p_return_id uuid, p_lines jsonb)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_bill uuid;
  v_whole boolean;
  v_status text;
  v_back jsonb;
  v_give jsonb;
begin
  select bill_id, client_ref is not null into v_bill, v_whole from returns where id = p_return_id and shop_id = p_shop_id;
  if not found then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'return not found';
  end if;
  -- The bill first (a void holds it too), then the return's own lines: one caller at a time.
  select status into v_status from bills where id = v_bill and shop_id = p_shop_id for update;
  if v_status is distinct from 'active' then
    return 'voided';
  end if;
  if v_whole then
    return 'ok';
  end if;
  perform 1 from return_items where return_id = p_return_id for update;

  -- What each waiting line puts back (in turn, where one bill line has several).
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'product_id', w.product_id, 'back', case when w.cap is null then w.want else least(w.cum, w.cap) - least(w.cum - w.want, w.cap) end)), '[]'::jsonb)
  into v_back
  from (
    select x.*, sum(x.want) over (partition by x.bill_item_id order by x.id) as cum
    from (
      select ri.id, ri.bill_item_id, ri.product_id,
             case
               when bi.stock_taken is not null then round(ri.quantity * coalesce(bi.stock_per_unit, 0), 3)
               when p.track_inventory then ri.quantity
               else 0
             end as want,
             case
               when bi.stock_taken is not null then greatest(bi.stock_taken - coalesce((select sum(coalesce(o.stock_back, o.quantity)) from return_items o where o.bill_item_id = bi.id), 0), 0)
             end as cap
      from return_items ri
      left join bill_items bi on bi.id = ri.bill_item_id
      left join products p on p.id = ri.product_id and p.shop_id = p_shop_id
      where ri.return_id = p_return_id
        and ri.stock_back = 0
        and ri.product_id is not null
        and ri.quantity > 0
        and ri.id in (select (e ->> 'return_item_id')::uuid from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e)
    ) x
  ) w;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', b ->> 'product_id', 'quantity', (b ->> 'back')::numeric)) filter (where (b ->> 'back')::numeric > 0), '[]'::jsonb)
  into v_give
  from jsonb_array_elements(v_back) b;
  if jsonb_array_length(v_give) > 0 then
    perform public.move_stock(p_shop_id, '[]'::jsonb, v_give, false);
    update return_items ri set stock_back = (b ->> 'back')::numeric
    from jsonb_array_elements(v_back) b
    where ri.id = (b ->> 'id')::uuid and (b ->> 'back')::numeric > 0;
  end if;
  return 'ok';
end;
$$;

-- p_lines: [{"bill_item_id", "product_id"?, "quantity"?}] — the bill's lines counted in stock: every
-- one of them, each once (none left out, none extra); the item and quantity given back come from the
-- bill itself, and a product_id or quantity sent along must match the bill's or the whole void is
-- refused (nothing changes, the bill stays active). Voids the bill (only from active) and gives back
-- what each line has out (stock_taken) less what its returns already gave back. The counted lines are
-- the ones whose record says they took stock — whatever the item's setting is today. A bill from
-- before this release has no record: its counted lines are its items counted in stock today, less a
-- dish sold by its recipe, and each gives back its quantity sold (the old rule). The medicine batches
-- and the dishes' raw materials go back in the same transaction (below). A bill with a return adjusted against udhaar
-- (refund_method 'credit_adjustment', made before or after this release) is not voided: that
-- adjustment would be counted twice — reverse or resolve it first.
-- {"result": "ok", "given": [...]} · {"result": "already_voided"} · {"result": "has_credit_adjustment"}.
create or replace function public.void_bill_stock(p_shop_id uuid, p_bill_id uuid, p_staff_id uuid, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_give jsonb;
  v_raw jsonb;
  v_required text[];
  v_sent text[];
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'lines must be a list';
  end if;
  -- The bill's row first — the row every return of it holds too — so no return can be saved between
  -- the check below and the void.
  select status into v_status from bills where id = p_bill_id and shop_id = p_shop_id for update;
  if not found or v_status is distinct from 'active' then
    return jsonb_build_object('result', 'already_voided');
  end if;
  if exists (select 1 from returns r where r.bill_id = p_bill_id and r.shop_id = p_shop_id and r.refund_method = 'credit_adjustment') then
    return jsonb_build_object('result', 'has_credit_adjustment');
  end if;

  -- Every line: this bill's own, with an item, named once, and matching what the bill says.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    left join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
    where bi.id is null
       or bi.product_id is null
       or (e ? 'product_id' and (e ->> 'product_id') is distinct from bi.product_id::text)
       or (e ? 'quantity' and (jsonb_typeof(e -> 'quantity') is distinct from 'number' or (e ->> 'quantity')::numeric <> bi.quantity))
  ) or (
    select count(*) <> count(distinct e ->> 'bill_item_id') from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
  ) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line is not this bill''s, is named twice, or doesn''t match the bill';
  end if;

  -- And nothing counted is left out: the lines sent must be exactly the bill's counted lines of this
  -- shop's items — by the record, the lines that took stock at the sale (a challan's goods included);
  -- on a bill from before this release, its items counted in stock today with a quantity, less a dish
  -- sold by its recipe (its raw materials were taken, not the dish; they come back separately). Lines
  -- that took nothing (services, plain lines, items not counted at the sale) aren't sent and move nothing.
  select coalesce(array_agg(bi.id::text), '{}'::text[])
  into v_required
  from bill_items bi
  join products p on p.id = bi.product_id and p.shop_id = p_shop_id
  where bi.bill_id = p_bill_id
    and case when bi.stock_taken is not null then bi.stock_taken > 0 else p.track_inventory and bi.quantity > 0 end;
  if to_regclass('public.kitchen_usage') is not null and to_regclass('public.recipe_lines') is not null then
    if exists (select 1 from kitchen_usage ku where ku.bill_id = p_bill_id) then
      select coalesce(array_agg(x), '{}'::text[])
      into v_required
      from unnest(v_required) x
      where not exists (
        select 1 from bill_items bi join recipe_lines rl on rl.dish_id = bi.product_id and rl.shop_id = p_shop_id
        where bi.id::text = x and bi.stock_taken is null
      );
    end if;
  end if;
  select coalesce(array_agg(e ->> 'bill_item_id'), '{}'::text[]) into v_sent from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;
  if not (v_sent <@ v_required and v_required <@ v_sent) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'the lines sent are not exactly the bill''s counted lines (one is missing, or isn''t counted)';
  end if;

  update bills
  set status = 'voided', voided_at = now(), voided_by = p_staff_id, void_reason = p_reason
  where id = p_bill_id;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'quantity', l.left_qty)), '[]'::jsonb)
  into v_give
  from (
    select bi.product_id,
           coalesce(bi.stock_taken, bi.quantity) - coalesce((
             select sum(coalesce(ri.stock_back, ri.quantity))
             from return_items ri
             join returns r on r.id = ri.return_id
             where ri.bill_item_id = bi.id and r.bill_id = p_bill_id
           ), 0) as left_qty
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    join bill_items bi on bi.id::text = e ->> 'bill_item_id' and bi.bill_id = p_bill_id
  ) l
  where l.left_qty > 0;
  perform public.move_stock(p_shop_id, '[]'::jsonb, v_give, false);

  -- Each medicine batch the bill drew from gets back what came out of it, less what its returns
  -- already put back to it — then marked, so nothing goes back to a batch twice. (A bill from before
  -- this release has no batch record: its batches aren't touched, as before.)
  update medicine_batches mb
  set quantity = mb.quantity + a.left_qty
  from (
    select bib.batch_id, sum(bib.quantity - bib.back) as left_qty
    from bill_item_batches bib
    join bill_items bi on bi.id = bib.bill_item_id and bi.bill_id = p_bill_id
    where bib.shop_id = p_shop_id and bib.back < bib.quantity
    group by bib.batch_id
  ) a
  where mb.id = a.batch_id and mb.shop_id = p_shop_id;
  update bill_item_batches bib
  set back = bib.quantity
  from bill_items bi
  where bi.id = bib.bill_item_id and bi.bill_id = p_bill_id and bib.shop_id = p_shop_id and bib.back < bib.quantity;

  -- The raw materials the bill's dishes took (the kitchen's ledger) go back: what really came off
  -- (stock_taken) — a short sale only what was there, after an edit what the ledger still holds. A row
  -- written before this release (stock_taken empty) gives back its quantity, as voids always did. The
  -- dish itself isn't put back (it was never taken). Then the bill's rows go, as a void always removed
  -- them — so nothing goes back twice (and the app finds none left to give back).
  if to_regclass('public.kitchen_usage') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', k.ingredient_id, 'quantity', k.back)), '[]'::jsonb)
    into v_raw
    from (
      select ku.ingredient_id, round(sum(coalesce(ku.stock_taken, ku.quantity)), 3) as back
      from kitchen_usage ku
      join products p on p.id = ku.ingredient_id and p.shop_id = p_shop_id
      where ku.bill_id = p_bill_id and ku.shop_id = p_shop_id and ku.kind = 'sale'
      group by ku.ingredient_id
    ) k
    where k.back > 0;
    if jsonb_array_length(v_raw) > 0 then
      perform public.move_stock(p_shop_id, '[]'::jsonb, v_raw, false);
    end if;
    delete from kitchen_usage where bill_id = p_bill_id and shop_id = p_shop_id and kind = 'sale';
  end if;
  return jsonb_build_object('result', 'ok', 'given', v_give);
end;
$$;

-- ─── 2c. A return, recorded in one go ─────────────────────────────────────────────
-- The whole return in one transaction holding the bill's row — the same row a void and every other
-- return of the bill hold — so none of them overlap:
--   • what is left to return is checked under that hold: two staff returning the same item at once
--     can't return more than was sold;
--   • the credit note, its lines, the goods back on the shelf (and to their medicine batch), and the
--     "adjust against udhaar" entry are all saved, or none is;
--   • a bill voided meanwhile: nothing is saved (and no adjustment is written against it);
--   • the goods go back as the sale's record says (2a): what the line took, never more, whatever the
--     item's setting is today;
--   • a returned item that isn't this shop's, or a counted medicine whose batch is missing or not its
--     own, refuses the whole return — its goods are never quietly left off the shelf;
--   • the same request again (p_client_ref, required: a retry after a lost answer, a double tap)
--     returns the return it already made, instead of making a second one; the same id sent for a
--     different bill is refused (request_conflict).

-- The form's own id for one return request: the same request is saved once.
alter table public.returns add column if not exists client_ref text;
create unique index if not exists returns_shop_client_ref on public.returns (shop_id, client_ref) where client_ref is not null;

-- p_header: {return_number, financial_year, reason, subtotal, cgst_amount, sgst_amount, igst_amount,
--   total, refund_method}. p_lines: [{bill_item_id, quantity, unit_price, gst_percent, line_subtotal,
--   cgst_amount, sgst_amount, igst_amount, line_total}] — the item and its name come from the bill.
-- p_credit_note: the note for the udhaar adjustment (null: none written).
-- {"result": "ok" | "duplicate", "return_id"} · {"result": "voided"} ·
-- {"result": "too_many", "bill_item_id", "left"}.
create or replace function public.record_return(
  p_shop_id uuid,
  p_bill_id uuid,
  p_staff_id uuid,
  p_client_ref text,
  p_header jsonb,
  p_lines jsonb,
  p_credit_note text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_customer uuid;
  v_return uuid;
  v_other_bill uuid;
  v_bad uuid;
  v_left numeric;
  v_dishes uuid[] := '{}'::uuid[];
  v_back jsonb;
  v_give jsonb;
  v_rest numeric;
  v_put numeric;
  v_total numeric := coalesce((p_header ->> 'total')::numeric, 0);
  r record;
  a record;
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a return needs at least one line';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where jsonb_typeof(e -> 'quantity') is distinct from 'number' or (e ->> 'quantity')::numeric <= 0) then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'every line needs a quantity greater than 0';
  end if;
  -- Every return request carries its id: without one a retry couldn't be told from a new return.
  if p_client_ref is null or btrim(p_client_ref) = '' then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a return request needs its id (client_ref)';
  end if;

  -- One at a time per bill: this return, the bill's other returns and its void.
  select status, customer_id into v_status, v_customer from bills where id = p_bill_id and shop_id = p_shop_id for update;
  if not found then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'bill not found';
  end if;
  -- The same request again (same id, same bill): the return it already made. The same id for another
  -- bill is not a retry — refused.
  select id, bill_id into v_return, v_other_bill from returns where shop_id = p_shop_id and client_ref = p_client_ref;
  if found then
    if v_other_bill is distinct from p_bill_id then
      raise exception 'request_conflict'
        using errcode = '23505',
              detail = jsonb_build_object('client_ref', p_client_ref, 'return_id', v_return)::text,
              hint = 'This return request id was already used for another bill.';
    end if;
    return jsonb_build_object('result', 'duplicate', 'return_id', v_return);
  end if;
  if v_status is distinct from 'active' then
    return jsonb_build_object('result', 'voided');
  end if;

  for r in
    select (e ->> 'bill_item_id')::uuid as bill_item_id, sum((e ->> 'quantity')::numeric) as qty
    from jsonb_array_elements(p_lines) e
    group by 1
  loop
    select bi.quantity - coalesce((select sum(ri.quantity) from return_items ri where ri.bill_item_id = bi.id), 0)
    into v_left
    from bill_items bi
    where bi.id = r.bill_item_id and bi.bill_id = p_bill_id;
    if not found then
      raise exception 'invalid_stock_move' using errcode = '22023', detail = 'a line is not on this bill';
    end if;
    if r.qty > v_left then
      return jsonb_build_object('result', 'too_many', 'bill_item_id', r.bill_item_id, 'left', greatest(v_left, 0));
    end if;
  end loop;

  -- Nothing is skipped quietly: a line's item, where it has one, must be this shop's (an item since
  -- deleted leaves its bill line with no item — nothing to put back — and stays a plain line) …
  select bi.product_id into v_bad
  from jsonb_array_elements(p_lines) e
  join bill_items bi on bi.id = (e ->> 'bill_item_id')::uuid and bi.bill_id = p_bill_id
  left join products p on p.id = bi.product_id and p.shop_id = p_shop_id
  where bi.product_id is not null and p.id is null
  limit 1;
  if found then
    raise exception 'unknown_item'
      using errcode = 'P0002',
            detail = jsonb_build_object('product_id', v_bad)::text,
            hint = 'A returned item is not in this shop''s list.';
  end if;

  -- What each line puts back on the shelf, in its item's stock unit (its stock_back). A bill line from
  -- this release: the returned quantity times its stock per unit, never more than the line still has
  -- out (what it took less what its returns already put back) — so nothing for a line that took
  -- nothing at the sale, and no more than a short sale took, whatever the item's setting is today. A
  -- line from before this release (no record): the old rule — the returned quantity, if the item is
  -- counted in stock today and isn't a dish sold by its recipe. Two lines of one bill line in one
  -- request share what it has out, in turn.
  if to_regclass('public.kitchen_usage') is not null and to_regclass('public.recipe_lines') is not null then
    if exists (select 1 from kitchen_usage ku where ku.bill_id = p_bill_id) then
      select coalesce(array_agg(bi.id), '{}'::uuid[]) into v_dishes
      from bill_items bi join recipe_lines rl on rl.dish_id = bi.product_id and rl.shop_id = p_shop_id
      where bi.bill_id = p_bill_id;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('n', w.n, 'bill_item_id', w.bill_item_id, 'product_id', w.product_id, 'batch_id', w.batch_id, 'recorded', w.cap is not null,
           'back', case when w.cap is null then w.want else least(w.cum, w.cap) - least(w.cum - w.want, w.cap) end)), '[]'::jsonb)
  into v_back
  from (
    select x.*, sum(x.want) over (partition by x.bill_item_id order by x.n) as cum
    from (
      select e.n, bi.id as bill_item_id, bi.product_id, bi.batch_id,
             case
               when bi.stock_taken is not null then round((e.v ->> 'quantity')::numeric * coalesce(bi.stock_per_unit, 0), 3)
               when p.track_inventory and not (bi.id = any(v_dishes)) then (e.v ->> 'quantity')::numeric
               else 0
             end as want,
             case
               when bi.stock_taken is not null then greatest(bi.stock_taken - coalesce((select sum(coalesce(ri.stock_back, ri.quantity)) from return_items ri where ri.bill_item_id = bi.id), 0), 0)
             end as cap
      from jsonb_array_elements(p_lines) with ordinality e(v, n)
      join bill_items bi on bi.id = (e.v ->> 'bill_item_id')::uuid and bi.bill_id = p_bill_id
      left join products p on p.id = bi.product_id and p.shop_id = p_shop_id
    ) x
  ) w;

  -- … and a medicine from before this release whose goods go back, sold from a batch, goes back to
  -- that same batch, of the same item. (A bill line from this release goes back to the batches its
  -- record names.)
  if exists (
    select 1
    from jsonb_array_elements(v_back) b
    left join medicine_batches mb on mb.id = (b ->> 'batch_id')::uuid and mb.product_id = (b ->> 'product_id')::uuid
    where (b ->> 'back')::numeric > 0 and b ->> 'batch_id' is not null and mb.id is null and not (b ->> 'recorded')::boolean
  ) then
    raise exception 'batch_mismatch' using errcode = '22023', detail = 'a returned medicine''s batch is missing or belongs to another item';
  end if;

  insert into returns (shop_id, bill_id, customer_id, staff_id, return_number, financial_year, reason, subtotal, cgst_amount, sgst_amount, igst_amount, total, refund_method, client_ref)
  values (
    p_shop_id, p_bill_id, v_customer, p_staff_id, p_header ->> 'return_number', p_header ->> 'financial_year', nullif(p_header ->> 'reason', ''),
    coalesce((p_header ->> 'subtotal')::numeric, 0), coalesce((p_header ->> 'cgst_amount')::numeric, 0), coalesce((p_header ->> 'sgst_amount')::numeric, 0),
    coalesce((p_header ->> 'igst_amount')::numeric, 0), v_total, coalesce(p_header ->> 'refund_method', 'cash'), p_client_ref
  )
  returning id into v_return;

  -- Every line is settled here: what it puts back goes back below (stock_back), the rest owes nothing.
  insert into return_items (return_id, bill_item_id, product_id, product_name, quantity, unit_price, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount, line_total, stock_back)
  select v_return, bi.id, bi.product_id, bi.product_name, (e.v ->> 'quantity')::numeric,
         coalesce((e.v ->> 'unit_price')::numeric, bi.unit_price), coalesce((e.v ->> 'gst_percent')::numeric, bi.gst_percent),
         coalesce((e.v ->> 'line_subtotal')::numeric, 0), coalesce((e.v ->> 'cgst_amount')::numeric, 0), coalesce((e.v ->> 'sgst_amount')::numeric, 0),
         coalesce((e.v ->> 'igst_amount')::numeric, 0), coalesce((e.v ->> 'line_total')::numeric, 0), (b ->> 'back')::numeric
  from jsonb_array_elements(p_lines) with ordinality e(v, n)
  join jsonb_array_elements(v_back) b on (b ->> 'n')::bigint = e.n
  join bill_items bi on bi.id = (e.v ->> 'bill_item_id')::uuid and bi.bill_id = p_bill_id;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', b ->> 'product_id', 'quantity', (b ->> 'back')::numeric)), '[]'::jsonb)
  into v_give
  from jsonb_array_elements(v_back) b
  where (b ->> 'back')::numeric > 0;
  if jsonb_array_length(v_give) > 0 then
    perform public.move_stock(p_shop_id, '[]'::jsonb, v_give, false);
  end if;

  -- A medicine goes back to its batches, as much as went back on the shelf. A bill line from this
  -- release: to the batches it drew from, in the order it drew from them (earliest expiry first), each
  -- up to what came out of it less what already went back to it — never more; anything beyond what the
  -- batches gave (they held less than the line took) goes back to the item only, as it came out. The
  -- returned goods can't be told apart by batch, so they are counted against the earliest expiry:
  -- that batch is sold, or written off, first — stock never looks fresher than it is.
  -- A line from before this release: to the one batch it names (the old rule).
  for r in
    select (b ->> 'bill_item_id')::uuid as bill_item_id, (b ->> 'back')::numeric as back
    from jsonb_array_elements(v_back) b
    where (b ->> 'back')::numeric > 0 and (b ->> 'recorded')::boolean
    order by (b ->> 'n')::bigint
  loop
    v_rest := r.back;
    for a in
      select bib.id, bib.batch_id, bib.quantity - bib.back as open
      from bill_item_batches bib
      where bib.bill_item_id = r.bill_item_id and bib.shop_id = p_shop_id and bib.back < bib.quantity
      order by bib.seq
      for update
    loop
      exit when v_rest <= 0;
      v_put := least(v_rest, a.open);
      update bill_item_batches set back = back + v_put where id = a.id;
      update medicine_batches set quantity = quantity + v_put where id = a.batch_id and shop_id = p_shop_id;
      v_rest := v_rest - v_put;
    end loop;
  end loop;
  update medicine_batches mb
  set quantity = mb.quantity + l.qty
  from (
    select (b ->> 'batch_id')::uuid as batch_id, sum((b ->> 'back')::numeric) as qty
    from jsonb_array_elements(v_back) b
    where (b ->> 'back')::numeric > 0 and b ->> 'batch_id' is not null and not (b ->> 'recorded')::boolean
    group by 1
  ) l
  where mb.id = l.batch_id;

  if p_credit_note is not null and p_header ->> 'refund_method' = 'credit_adjustment' and v_customer is not null and v_total > 0 then
    insert into payments (shop_id, customer_id, staff_id, amount, payment_method, note)
    values (p_shop_id, v_customer, p_staff_id, v_total, 'adjustment', p_credit_note);
  end if;

  return jsonb_build_object('result', 'ok', 'return_id', v_return);
end;
$$;

revoke all on function public.record_return(uuid, uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_return(uuid, uuid, uuid, text, jsonb, jsonb, text) to service_role;

revoke all on function public.give_back_return(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.give_back_return(uuid, uuid, jsonb) to service_role;
revoke all on function public.void_bill_stock(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.void_bill_stock(uuid, uuid, uuid, text, jsonb) to service_role;

-- ─── 3. The single-item functions ───────────────────────────────────────────────

create or replace function public.decrement_stock(p_product_id uuid, p_quantity numeric)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'quantity must be greater than 0';
  end if;
  update products set stock_quantity = stock_quantity - p_quantity
  where id = p_product_id and stock_quantity >= p_quantity;
  if not found then
    select stock_quantity into v_stock from products where id = p_product_id;
    if found then
      raise exception 'insufficient_stock'
        using errcode = 'P0001',
              detail = jsonb_build_object('product_id', p_product_id, 'requested', p_quantity, 'available', v_stock)::text;
    end if;
  end if;
end;
$$;

create or replace function public.increment_stock(p_product_id uuid, p_quantity numeric)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_stock_move' using errcode = '22023', detail = 'quantity must be greater than 0';
  end if;
  update products set stock_quantity = stock_quantity + p_quantity where id = p_product_id;
end;
$$;

-- They take an item id and no shop, so only the app's server may call them (it always does, with
-- the service role); the browser's keys (anon, authenticated) had EXECUTE until now.
revoke all on function public.decrement_stock(uuid, numeric) from public, anon, authenticated;
grant execute on function public.decrement_stock(uuid, numeric) to service_role;
revoke all on function public.increment_stock(uuid, numeric) from public, anon, authenticated;
grant execute on function public.increment_stock(uuid, numeric) to service_role;

-- ─── 4. "Don't bill more than stock": on, unless the owner chose off ──────────────────

alter table public.shops add column if not exists block_oversell boolean not null default true;
alter table public.shops alter column block_oversell set default true;
-- When the owner last chose in Settings → Stock. Null: never chosen, so the default applies. From
-- this release the app writes it with every choice, and a chosen setting is never overwritten.
alter table public.shops add column if not exists block_oversell_chosen_at timestamptz;

-- Before this release (migration 0059) nothing recorded who chose: a shop that is off is either
-- untouched (the old default was off) or switched off on purpose, and the two look the same. Shops
-- known to have chosen off on purpose: put their ids in this list before running, to keep them off.
-- Every other shop that is off was never chosen and is turned on — the default from now on.
-- The 33 demo/test shops (owner-confirmed, 30 Oct 2026) stay off. S.S. MART, the one live shop
-- (8ea30b18-df8c-419d-b788-34050cb6b55b), is deliberately not listed: it is turned on.
update public.shops
set block_oversell_chosen_at = now()
where id = any (array[
    'aa8486c7-fe46-468f-adb1-9d90ce914284',
    '328f418c-7051-44ad-a050-969a7db554dc',
    '36c1853e-5abd-47a5-8d6d-ab3cbce6205d',
    '13ae6285-d879-48c0-8a03-fe32005f60f6',
    'ec2a0a9c-02b7-4b13-8824-a6b8982699f4',
    '4ac7338a-2fa6-4560-8d17-e73bebd2c8ca',
    '392241cc-78e3-435b-9a27-519539ca2c83',
    '68174776-058d-481b-94e8-2980017405cd',
    '3b385b34-014b-48b5-a461-967bb7c694eb',
    '3e50ede2-105f-4d7d-bac8-adc46f64df61',
    '5b27c8ea-8181-43c9-8cc7-ed6c8db622a6',
    '9b027762-746d-4b66-90f7-1221be4b81c4',
    '835b0c96-ab2b-4e5d-81e9-01e0db7a2f5a',
    '4e60ea9e-44f3-4f19-be8f-5052c88781f3',
    'e8089057-91db-406e-a178-daad75083a57',
    '3d7ee1fb-b4bd-447e-9a58-a48e043f0aeb',
    '6eeabd34-5927-4fa3-9453-b2387b653fd4',
    '45e9db15-faa7-4a31-aac3-2ea2c2d99db6',
    'c0de3b27-a3d6-4cfd-9ad5-291a5ea4b2bb',
    '63a6ebe1-c5d0-4221-bebd-a067089a1e1d',
    'db64bd01-e403-4c63-8ab3-30a0958c3221',
    '0d2dcf1c-c01b-4a57-9b3d-471c56e3732f',
    'cde68db1-e317-420f-8865-224d06b0d04f',
    'f3ff48e4-bdb9-4689-84fd-9b1b827a154c',
    'd16da9cb-3ad7-477f-826a-db6102772d50',
    '11878a1b-9bf2-408a-8c86-00cf724ca1ff',
    '81c2372b-6331-46e1-944e-c6240980fa30',
    '6c54c997-b12b-415f-bec1-55afb8ad8395',
    '84ab1768-cbcf-4440-a238-151583727c54',
    '7d2ecd8f-7b24-4508-b7af-1cadd83e699c',
    '7cb3dc5c-c834-456f-a679-cfd8c8e20727',
    '05cb8644-8047-4cb7-86e9-b4496f555f2b',
    'a540f19c-32b3-4974-b054-2bbe8aef52e0'
  ]::uuid[])
  and block_oversell = false
  and block_oversell_chosen_at is null;
update public.shops
set block_oversell = true
where block_oversell = false
  and block_oversell_chosen_at is null;

commit;

-- ─── Rollback (run by hand only if this release must be undone) ──────────────────
-- Prefer going forward: the previous app release works with this database as it is (its
-- decrement_stock calls are refused instead of stopping at zero — logged, never below zero), so
-- an app problem is fixed by deploying the previous release, with no SQL at all.
--
-- To take the database back too: deploy the previous app release first, then run the block below.
-- It drops the bill lines' record (bill_items.stock_taken / stock_per_unit / recipe_sale, bill_item_batches): the
-- previous release edits quantities and returns medicines without keeping it up to date, so after a
-- rollback it could no longer be trusted; without it, a later re-run treats those bills like any bill
-- from before this release (the old rule: a return goes back to bill_items.batch_id, the first batch).
-- It keeps these on purpose:
--   • kitchen_usage.stock_taken — the previous release leaves it empty on new rows, which then give
--     back their quantity on a void, as before.
--   • return_items.stock_back — what each return already put back on the shelf. Dropping it would
--     lose that: if 0060 is run again later, every return would count as given back, including any
--     whose goods never went back (stock_back 0), and nothing could tell them apart. Kept, a later
--     re-run picks up exactly where it was. (The previous release leaves it empty on new returns,
--     which then count as given back — that release puts a return's goods back as it saves it.)
--   • shops.block_oversell_chosen_at — what owners chose, so a re-run never overrides them.
--   • returns.client_ref (and its index) — harmless to the previous release, which leaves it empty.
-- decrement_stock / increment_stock go back to their old bodies; who may call them stays as above
-- (the server only — the previous release calls them only from the server).
--
-- [rollback-start]
-- begin;
-- drop trigger if exists products_stock_not_below_zero on public.products;
-- drop trigger if exists medicine_batches_stock_not_below_zero on public.medicine_batches;
-- drop function if exists public.stock_not_below_zero();
-- drop function if exists public.void_bill_stock(uuid, uuid, uuid, text, jsonb);
-- drop function if exists public.give_back_return(uuid, uuid, jsonb);
-- drop function if exists public.record_return(uuid, uuid, uuid, text, jsonb, jsonb, text);
-- drop function if exists public.take_bill_stock(uuid, uuid, jsonb, boolean, jsonb);
-- drop function if exists public.edit_bill_stock(uuid, uuid, jsonb, jsonb, boolean);
-- drop function if exists public.move_stock(uuid, jsonb, jsonb, boolean);
-- drop table if exists public.bill_item_batches;
-- alter table public.bill_items drop column if exists stock_taken, drop column if exists stock_per_unit, drop column if exists recipe_sale;
-- create or replace function public.decrement_stock(p_product_id uuid, p_quantity numeric)
-- returns void language sql as $fn$
--   update products set stock_quantity = greatest(0, stock_quantity - p_quantity) where id = p_product_id;
-- $fn$;
-- create or replace function public.increment_stock(p_product_id uuid, p_quantity numeric)
-- returns void language sql as $fn$
--   update products set stock_quantity = stock_quantity + p_quantity where id = p_product_id;
-- $fn$;
-- alter table public.shops alter column block_oversell set default false;
-- commit;
-- [rollback-end]
--
-- Then: notify pgrst, 'reload schema';  and remove 0060_stock_guard from schema_migrations.
-- (Shops keep their stock rule setting; each owner can change it in Settings → Stock.)
