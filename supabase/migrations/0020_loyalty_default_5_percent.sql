-- Genuinely turn loyalty points ON by default at 5% (5 points per
-- ₹100 spent, each point worth ₹1) instead of off — still fully
-- editable per-shop at /loyalty-settings.
alter table shops alter column loyalty_points_per_100 set default 5;

-- Genuinely apply the new 5% default to every EXISTING shop that
-- hasn't customized it (still sitting at the old untouched 0
-- default) — shops that already set their own rate are left alone.
update shops set loyalty_points_per_100 = 5 where loyalty_points_per_100 = 0;
