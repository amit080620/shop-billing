-- Expose the printer hardware's full range: 0 (condensed) through 7
-- (its maximum multiplier step, ~63pt) — was capped at 6 before,
-- leaving one genuinely-available size unused.

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t58_shop_name_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t58_shop_name_size_check check (t58_shop_name_size between 0 and 7);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t58_total_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t58_total_size_check check (t58_total_size between 0 and 7);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t80_shop_name_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t80_shop_name_size_check check (t80_shop_name_size between 0 and 7);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t80_total_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t80_total_size_check check (t80_total_size between 0 and 7);
