-- Genuinely soft-delete for restaurant tables — hard-deleting a table
-- that has ever had a bill on it always failed against the foreign
-- key from restaurant_orders.table_id. Archiving (is_deleted = true)
-- genuinely lets an owner force-remove a table from the active list
-- without ever breaking historical order/billing records.
alter table restaurant_tables add column if not exists is_deleted boolean not null default false;
