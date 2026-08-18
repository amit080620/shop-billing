-- Flexible device identifiers for Service jobs (IMEI, chassis no.,
-- serial no., etc.) — a category hint plus an open-ended list of
-- label/value pairs, since different device types (and even multiple
-- IDs on the same device, like dual-SIM IMEIs) don't fit fixed columns.
alter table service_jobs add column if not exists device_category text;
alter table service_jobs add column if not exists identifiers jsonb not null default '[]'::jsonb;
