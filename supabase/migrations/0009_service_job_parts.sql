-- Parts drawn from shop inventory to complete a repair job — links
-- service jobs to genuine products, so stock is deducted correctly
-- when the job is billed (see service.ts deliverJobAction).
create table if not exists service_job_parts (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references service_jobs(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  gst_percent numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);
alter table service_job_parts enable row level security;
create index if not exists idx_service_job_parts_job on service_job_parts(job_id);
