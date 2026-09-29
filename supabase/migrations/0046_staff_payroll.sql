-- Staff attendance and salary: the people who work in the shop (with or without a login), who
-- came in each day, and what they were paid.
--
-- workers            — the payroll list: monthly salary or a daily wage. A worker can be linked to
--                      a staff login, but most helpers never log in.
-- worker_attendance  — one mark per worker per day: present, half day, absent, leave (paid), off.
-- worker_payments    — money given to a worker: an advance, the salary, a bonus — against a month
--                      ("2026-09"), with how it was paid. Cash paid out shows in the Daily summary.

create table if not exists workers (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  staff_id uuid,                                   -- their login, if they have one
  name text not null,
  phone text,
  designation text,
  pay_type text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  monthly_salary numeric(12, 2) not null default 0,
  daily_wage numeric(12, 2) not null default 0,
  joined_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_workers_shop on workers (shop_id, is_active);

create table if not exists worker_attendance (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('present', 'half', 'absent', 'leave', 'off')),
  marked_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_worker_attendance_day on worker_attendance (worker_id, work_date);
create index if not exists idx_worker_attendance_shop_day on worker_attendance (shop_id, work_date);

create table if not exists worker_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  for_month text not null,                         -- 'YYYY-MM' the payment belongs to
  kind text not null check (kind in ('advance', 'salary', 'bonus')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other')),
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_worker_payments_shop_day on worker_payments (shop_id, created_at);
create index if not exists idx_worker_payments_worker_month on worker_payments (worker_id, for_month);

-- Read and written only by the server (service role), like every other money table.
alter table workers enable row level security;
alter table worker_attendance enable row level security;
alter table worker_payments enable row level security;
