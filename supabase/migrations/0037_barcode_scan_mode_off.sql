-- Adds the missing 'off' option — turns barcode scanning off entirely
-- (hides both the camera scanner and the hardware-scanner text input
-- everywhere in the app) for shops that never use it. The original
-- constraint only allowed ('camera', 'hardware', 'both'), so this
-- value would have been rejected by the database even after the UI
-- was updated to offer it.
alter table shops drop constraint if exists shops_barcode_scan_mode_check;
alter table shops add constraint shops_barcode_scan_mode_check check (barcode_scan_mode in ('camera', 'hardware', 'both', 'off'));
