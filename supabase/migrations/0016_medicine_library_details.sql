-- Genuine expansion of the medicine library to hold rich clinical data
-- (for CSV import of a real medicine database), not just a bare name.
alter table shop_medicine_library add column if not exists price numeric(10,2);
alter table shop_medicine_library add column if not exists manufacturer_name text;
alter table shop_medicine_library add column if not exists medicine_type text;
alter table shop_medicine_library add column if not exists pack_size_label text;
alter table shop_medicine_library add column if not exists composition text;
alter table shop_medicine_library add column if not exists description text;
alter table shop_medicine_library add column if not exists side_effects text;
alter table shop_medicine_library add column if not exists is_discontinued boolean not null default false;
