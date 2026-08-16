-- Virtual (auto-created online-order) tables get deleted after settlement.
alter table restaurant_tables add column if not exists is_virtual boolean not null default false;
