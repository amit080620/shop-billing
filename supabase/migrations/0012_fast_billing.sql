-- Fast Billing — genuinely opt-in (default false for every existing
-- shop, so nothing changes until an owner deliberately turns it on).
alter table shops add column if not exists fast_billing_enabled boolean not null default false;

-- Per-product Fast Billing display config — genuinely separate from
-- the product's normal catalog visibility (show_in_catalog is for the
-- public online storefront, this is for the in-shop quick-tile grid).
alter table products add column if not exists show_in_fast_billing boolean not null default false;
alter table products add column if not exists fast_billing_order integer not null default 0;
