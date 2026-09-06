-- Every page in this app scopes its queries to the logged-in shop
-- (`.eq("shop_id", ...)`) — without an index on shop_id, each of
-- those queries degrades to a full table scan as the table grows,
-- which is invisible on a fresh/small database and gets steadily
-- slower with real usage over months. IF NOT EXISTS makes every one
-- of these a safe no-op if it already exists — this migration can
-- never break or lose anything, only ever add missing indexes.

-- Core, highest-traffic tables — queried on nearly every page.
create index if not exists idx_bills_shop_id on bills(shop_id);
create index if not exists idx_bills_shop_status_created on bills(shop_id, status, created_at desc);
create index if not exists idx_bills_customer_id on bills(customer_id);

create index if not exists idx_bill_items_bill_id on bill_items(bill_id);
create index if not exists idx_bill_items_product_id on bill_items(product_id);

create index if not exists idx_customers_shop_id on customers(shop_id);
create index if not exists idx_customers_shop_phone on customers(shop_id, phone);

create index if not exists idx_products_shop_id on products(shop_id);

create index if not exists idx_payments_shop_id on payments(shop_id);
create index if not exists idx_payments_customer_id on payments(customer_id);

create index if not exists idx_purchases_shop_id on purchases(shop_id);
create index if not exists idx_purchase_items_purchase_id on purchase_items(purchase_id);
create index if not exists idx_purchase_items_product_id on purchase_items(product_id);
create index if not exists idx_purchase_payments_shop_id on purchase_payments(shop_id);

create index if not exists idx_vendors_shop_id on vendors(shop_id);

-- Restaurant module — orders/tables scoped per shop, and settled
-- filtering happens on nearly every restaurant dashboard load.
create index if not exists idx_restaurant_orders_shop_id on restaurant_orders(shop_id);
create index if not exists idx_restaurant_orders_shop_status on restaurant_orders(shop_id, status);
create index if not exists idx_restaurant_order_items_order_id on restaurant_order_items(order_id);

-- Batch/expiry tracking — queried by every dashboard's expiring-stock
-- check and the Profit Leak Detector.
create index if not exists idx_medicine_batches_shop_id on medicine_batches(shop_id);
create index if not exists idx_medicine_batches_expiry on medicine_batches(shop_id, expiry_date) where quantity > 0;
