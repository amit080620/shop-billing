-- Loyalty program — genuinely opt-in (points_per_100 = 0 means off, the
-- default for every existing shop so nothing changes until an owner
-- deliberately turns it on in Settings).
alter table shops add column if not exists loyalty_points_per_100 numeric(6, 2) not null default 0;
alter table shops add column if not exists loyalty_redemption_value numeric(6, 2) not null default 1;
alter table customers add column if not exists loyalty_points integer not null default 0;

create or replace function increment_loyalty_points(p_customer_id uuid, p_points integer)
returns void language sql as $$
  update customers
  set loyalty_points = loyalty_points + p_points
  where id = p_customer_id;
$$;

create or replace function redeem_loyalty_points(p_customer_id uuid, p_points integer)
returns void language sql as $$
  update customers
  set loyalty_points = greatest(0, loyalty_points - p_points)
  where id = p_customer_id;
$$;

