-- Genuinely adds the delivery lifecycle (Ready for Delivery →
-- Dispatched → Completed) on top of an already-accepted catalog
-- order — the existing pending/accepted/rejected review workflow is
-- untouched; this tracks what happens to an order AFTER the shop has
-- agreed to fulfill it.
alter table catalog_order_requests add column if not exists delivery_status text check (delivery_status in ('ready', 'dispatched', 'completed'));
