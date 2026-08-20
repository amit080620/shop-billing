-- Read-only "Leads Dashboard" access — genuinely separate from
-- super_admins. See schema.sql for the full rationale.
create table if not exists team_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table team_viewers enable row level security;
