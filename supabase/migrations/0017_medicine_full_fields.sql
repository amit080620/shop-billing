-- Genuine full-field expansion of the medicine library — capturing
-- every column from a real-world medicine database export, not just
-- a subset.
alter table shop_medicine_library add column if not exists short_composition1 text;
alter table shop_medicine_library add column if not exists short_composition2 text;
alter table shop_medicine_library add column if not exists drug_interactions jsonb;

-- Genuine per-shop control over exactly which medicine-detail fields
-- appear on a printed prescription — a shop decides, field by field,
-- what makes their Rx as detailed (or as simple) as they want.
alter table prescription_settings add column if not exists rx_show_price boolean not null default false;
alter table prescription_settings add column if not exists rx_show_manufacturer boolean not null default false;
alter table prescription_settings add column if not exists rx_show_composition boolean not null default true;
alter table prescription_settings add column if not exists rx_show_pack_size boolean not null default false;
alter table prescription_settings add column if not exists rx_show_side_effects boolean not null default false;
alter table prescription_settings add column if not exists rx_show_drug_interactions boolean not null default false;
alter table prescription_settings add column if not exists rx_show_description boolean not null default false;
