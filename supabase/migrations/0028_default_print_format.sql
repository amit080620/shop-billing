-- Genuinely lets the owner set a default print format (A4 / 58mm /
-- 80mm thermal) so bills open directly in their preferred format —
-- switching format from the print screen itself always still works
-- and doesn't touch this default.
alter table shops add column if not exists default_print_format text not null default 'full' check (default_print_format in ('full', 'thermal58', 'thermal'));

-- Genuinely real ESC/POS alignment control (ESC a n) for the shop
-- name and total lines, per paper width.
alter table thermal_print_settings add column if not exists t58_shop_name_align text not null default 'center' check (t58_shop_name_align in ('left', 'center', 'right'));
alter table thermal_print_settings add column if not exists t58_total_align text not null default 'left' check (t58_total_align in ('left', 'center', 'right'));
alter table thermal_print_settings add column if not exists t80_shop_name_align text not null default 'center' check (t80_shop_name_align in ('left', 'center', 'right'));
alter table thermal_print_settings add column if not exists t80_total_align text not null default 'left' check (t80_total_align in ('left', 'center', 'right'));
