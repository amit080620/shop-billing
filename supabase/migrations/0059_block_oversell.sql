-- Settings → Stock: a shop can refuse to bill more of an item than it has in stock. Off by default
-- (billing past zero stays allowed, as before), so nothing changes until the owner switches it on.
alter table public.shops add column if not exists block_oversell boolean not null default false;
