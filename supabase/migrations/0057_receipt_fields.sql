-- Thermal print settings: which parts of the receipt the shop owner hid (lib/print/receiptFields).
alter table public.thermal_print_settings add column if not exists hidden_fields text[] not null default '{}';
