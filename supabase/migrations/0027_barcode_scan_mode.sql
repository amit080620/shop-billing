-- Genuinely a shop-level preference for barcode scanning — some
-- shops use a hardware laser-scanner device (types the code and
-- presses Enter automatically), others use their phone's camera.
-- Defaults to 'both' so nothing changes for existing shops until
-- they genuinely pick a preference in Profile settings.
alter table shops add column if not exists barcode_scan_mode text not null default 'both' check (barcode_scan_mode in ('camera', 'hardware', 'both'));
