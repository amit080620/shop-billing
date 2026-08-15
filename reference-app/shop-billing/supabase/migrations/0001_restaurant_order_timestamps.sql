-- Order-lifecycle timestamps for restaurant_orders — previously only
-- created_at/settled_at/cancelled_at existed, so there was no real data
-- for "when did this go to kitchen / become ready / get served".
alter table restaurant_orders add column if not exists sent_to_kitchen_at timestamptz;
alter table restaurant_orders add column if not exists first_ready_at timestamptz;
alter table restaurant_orders add column if not exists served_at timestamptz;
