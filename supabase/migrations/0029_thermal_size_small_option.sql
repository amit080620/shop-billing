-- Widen thermal print size columns to allow 0, the new "Small" option
-- (genuine condensed Font B on the printer hardware — see
-- EscPosBuilder.sizeLevel in lib/escpos.ts). Previously these only
-- allowed 1-6 (normal and up); this adds the one real size step
-- smaller than normal that ESC/POS thermal printers actually support.

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t58_shop_name_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t58_shop_name_size_check check (t58_shop_name_size between 0 and 6);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t58_total_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t58_total_size_check check (t58_total_size between 0 and 6);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t80_shop_name_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t80_shop_name_size_check check (t80_shop_name_size between 0 and 6);

alter table thermal_print_settings drop constraint if exists thermal_print_settings_t80_total_size_check;
alter table thermal_print_settings add constraint thermal_print_settings_t80_total_size_check check (t80_total_size between 0 and 6);
