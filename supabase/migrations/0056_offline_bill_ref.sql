-- Offline bills: each bill made with no internet carries the id the phone gave it, so a sync that
-- is retried after a dropped connection finds the bill already made instead of making it twice.
alter table public.bills add column if not exists client_ref text;

create unique index if not exists bills_shop_client_ref
  on public.bills (shop_id, client_ref)
  where client_ref is not null;
