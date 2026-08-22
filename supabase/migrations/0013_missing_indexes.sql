-- Genuine performance fix — staff can grow to several rows per shop
-- and is queried on every staff-management screen. (categories was
-- also checked, but it already has an implicit index via its own
-- unique(shop_id, name) constraint, so it genuinely doesn't need a
-- separate one.)
create index if not exists idx_staff_shop_id on staff(shop_id);
