-- Genuine dental Treatment Plan → Quotation → Invoice workflow.
create table if not exists treatment_plans (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  patient_id uuid references customers(id),
  patient_name text not null,
  patient_phone text,
  doctor_name text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  bill_id uuid references bills(id) on delete set null,
  staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table treatment_plans enable row level security;
create index if not exists idx_treatment_plans_shop on treatment_plans(shop_id);
create index if not exists idx_treatment_plans_patient on treatment_plans(patient_id);

create table if not exists treatment_plan_items (
  id uuid primary key default uuid_generate_v4(),
  treatment_plan_id uuid not null references treatment_plans(id) on delete cascade,
  tooth_number text,
  procedure_name text not null,
  description text,
  estimated_cost numeric(12,2) not null default 0,
  status text not null default 'planned' check (status in ('planned', 'completed', 'billed')),
  completed_at timestamptz,
  sort_order integer not null default 0
);
alter table treatment_plan_items enable row level security;
create index if not exists idx_treatment_plan_items_plan on treatment_plan_items(treatment_plan_id);
