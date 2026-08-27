-- Genuinely lets a table booking capture which customer it's for
-- (optional — a table can still be booked with zero customer
-- details, per the "continue without loyalty points" flow).
alter table restaurant_orders add column if not exists customer_id uuid references customers(id);
create index if not exists idx_restaurant_orders_customer on restaurant_orders(customer_id);
