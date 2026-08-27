-- Genuinely replace the binary large/not-large toggle with a real
-- size LEVEL (1-6) matching what ESC/POS thermal printers actually
-- support (discrete width/height multiplier steps, not arbitrary
-- point sizes like a word processor) — and add genuine italic
-- support (ESC 4/5, a real command in the standard Epson ESC/POS set).
alter table thermal_print_settings add column if not exists t58_shop_name_size integer not null default 2 check (t58_shop_name_size between 1 and 6);
alter table thermal_print_settings add column if not exists t58_shop_name_italic boolean not null default false;
alter table thermal_print_settings add column if not exists t58_total_size integer not null default 2 check (t58_total_size between 1 and 6);
alter table thermal_print_settings add column if not exists t58_total_italic boolean not null default false;
alter table thermal_print_settings add column if not exists t80_shop_name_size integer not null default 2 check (t80_shop_name_size between 1 and 6);
alter table thermal_print_settings add column if not exists t80_shop_name_italic boolean not null default false;
alter table thermal_print_settings add column if not exists t80_total_size integer not null default 2 check (t80_total_size between 1 and 6);
alter table thermal_print_settings add column if not exists t80_total_italic boolean not null default false;
