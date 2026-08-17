-- Shop-level choice: are product/menu prices the final (GST-inclusive)
-- amount, or the pre-tax base with GST added on top? Both are
-- legitimate; different shop owners price things differently.
alter table shops add column if not exists price_includes_gst boolean not null default true;

-- Captured per-transaction at creation time so historical bills/orders
-- always reverse-calculate correctly even if the shop's setting
-- changes later.
alter table bills add column if not exists price_includes_gst boolean not null default true;
alter table restaurant_orders add column if not exists price_includes_gst boolean not null default true;
alter table rentals add column if not exists price_includes_gst boolean not null default true;
