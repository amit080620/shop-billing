-- Genuine full prescription templates — a doctor saves a whole Rx
-- (chief complaint, diagnosis, advice, medicines) as a reusable
-- preset like "Fever" or "Viral", tap it once for a new patient and
-- edit the specifics from there instead of typing everything fresh.
create table if not exists prescription_templates (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  chief_complaint text,
  diagnosis text,
  advice text,
  custom_sections jsonb not null default '[]'::jsonb,
  medicines jsonb not null default '[]'::jsonb,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);
create index if not exists idx_prescription_templates_shop on prescription_templates(shop_id);
alter table prescription_templates enable row level security;

-- Genuine growing per-field phrase library — every Chief Complaint,
-- Diagnosis, or Advice text typed once becomes a quick-tap chip above
-- that same field on the next prescription, the busiest phrases
-- floating to the top over time (same pattern as the medicine
-- library, applied to free-text fields instead of medicine names).
create table if not exists prescription_quick_phrases (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  field_label text not null,
  phrase text not null,
  usage_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  unique (shop_id, field_label, phrase)
);
create index if not exists idx_prescription_quick_phrases_shop on prescription_quick_phrases(shop_id, field_label);
alter table prescription_quick_phrases enable row level security;
