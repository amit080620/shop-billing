-- Remembers "when a scan reads X, the shop actually meant Y" so a
-- name/item the OCR or AI scan misreads once doesn't keep getting
-- misread the same way forever. Genuinely per-shop (a correction one
-- shop teaches it has no bearing on another shop's items).
create table if not exists ocr_corrections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  wrong_text text not null,
  correct_text text not null,
  created_at timestamptz not null default now(),
  unique (shop_id, wrong_text)
);

create index if not exists ocr_corrections_shop_id_idx on ocr_corrections(shop_id);

alter table ocr_corrections enable row level security;
