-- 0064: force_delete_shop for garment shops.
--
-- Why: the function empties every table with a shop_id before deleting the shop, but
-- inventory_ledger (migration 0063) refuses any delete while its shop exists, so a garment shop with
-- stock movements could not be deleted: "ledger_append_only (still in use: inventory_ledger)".
-- The function now leaves that one table alone: its rows go by cascade with the shop row, which is
-- the one removal the ledger's rule allows. Nothing else changes; the ledger still refuses every
-- other update or delete.
-- Safe to run more than once (create or replace). Only touches this function.

create or replace function public.force_delete_shop(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  fk record;
  n bigint;
  progress boolean;
  pass int := 0;
  blocked text[];
  last_error text := null;
  staff_ids uuid[];
  deleted jsonb := '{}'::jsonb;
  shop_name text;
  logins int := 0;
begin
  select name into shop_name from shops where id = p_shop_id;
  if shop_name is null then
    return jsonb_build_object('ok', false, 'error', 'Shop not found');
  end if;
  select coalesce(array_agg(id), '{}') into staff_ids from staff where shop_id = p_shop_id;

  loop
    pass := pass + 1;
    progress := false;
    blocked := '{}';
    for t in
      select c.table_name::text as name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'shop_id' and c.table_name not in ('shops', 'inventory_ledger')
      order by c.table_name
    loop
      begin
        execute format('delete from public.%I where shop_id = $1', t.name) using p_shop_id;
        get diagnostics n = row_count;
        if n > 0 then
          progress := true;
          deleted := deleted || jsonb_build_object(t.name, coalesce((deleted ->> t.name)::bigint, 0) + n);
        end if;
      exception when others then
        blocked := blocked || t.name;
        last_error := sqlerrm;
      end;
    end loop;

    exit when cardinality(blocked) = 0 or pass >= 30;

    if not progress then
      -- Force: whatever still points at this shop's rows in a blocked table goes, or is unlinked.
      for fk in
        select con.conrelid::regclass::text as child, ca.attname::text as child_col,
               pr.relname::text as parent, pa.attname::text as parent_col
        from pg_constraint con
        join pg_class pr on pr.oid = con.confrelid
        join pg_namespace pn on pn.oid = pr.relnamespace and pn.nspname = 'public'
        join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = con.conkey[1]
        join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
        where con.contype = 'f' and cardinality(con.conkey) = 1 and pr.relname = any(blocked)
      loop
        begin
          execute format('delete from %s where %I in (select %I from public.%I where shop_id = $1)', fk.child, fk.child_col, fk.parent_col, fk.parent) using p_shop_id;
          get diagnostics n = row_count;
          if n > 0 then progress := true; end if;
        exception when others then
          begin
            execute format('update %s set %I = null where %I in (select %I from public.%I where shop_id = $1)', fk.child, fk.child_col, fk.child_col, fk.parent_col, fk.parent) using p_shop_id;
            get diagnostics n = row_count;
            if n > 0 then progress := true; end if;
          exception when others then
            last_error := sqlerrm;
          end;
        end;
      end loop;
      exit when not progress;
    end if;
  end loop;

  if cardinality(blocked) > 0 then
    return jsonb_build_object('ok', false, 'error', coalesce(last_error, 'Some data could not be removed'), 'blocked', to_jsonb(blocked), 'deleted', deleted);
  end if;

  begin
    delete from shops where id = p_shop_id;
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'deleted', deleted);
  end;

  if cardinality(staff_ids) > 0 then
    begin
      delete from auth.users where id = any(staff_ids);
      get diagnostics logins = row_count;
    exception when others then
      last_error := sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true, 'shop', shop_name, 'deleted', deleted, 'logins_removed', logins,
    'login_error', case when logins < cardinality(staff_ids) then last_error end);
end;
$$;

revoke all on function public.force_delete_shop(uuid) from public;
revoke all on function public.force_delete_shop(uuid) from anon, authenticated;
grant execute on function public.force_delete_shop(uuid) to service_role;
