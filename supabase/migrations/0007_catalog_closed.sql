-- Temporary shop closure for the online catalog.
alter table catalog_settings add column if not exists is_closed boolean not null default false;
alter table catalog_settings add column if not exists closed_from date;
alter table catalog_settings add column if not exists closed_until date;
