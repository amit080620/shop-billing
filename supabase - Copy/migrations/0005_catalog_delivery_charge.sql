-- Delivery charge for catalog (online) orders.
alter table catalog_settings add column if not exists delivery_enabled boolean not null default false;
alter table catalog_settings add column if not exists delivery_charge numeric(12, 2) not null default 0;
alter table catalog_order_requests add column if not exists wants_delivery boolean not null default false;
alter table catalog_order_requests add column if not exists delivery_charge numeric(12, 2) not null default 0;
