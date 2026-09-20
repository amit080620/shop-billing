-- Subscription plans: Free / Basic / Pro / Pro+ / Custom.
--
-- Until now every shop got every feature unless a super admin hand-picked
-- modules for it (shops.enabled_modules). Plans make that a product: each
-- plan carries its own module set and limits, the admin assigns the plan
-- when payment arrives, and enabled_modules stays as a per-shop override
-- for the rare custom deal.

alter table shops add column if not exists plan text not null default 'free'
  check (plan in ('free', 'basic', 'pro', 'pro_plus', 'custom'));

-- When a paid plan was assigned, and by whom — plain record-keeping for
-- renewals and support calls.
alter table shops add column if not exists plan_started_at timestamptz;
alter table shops add column if not exists plan_note text;

-- Custom plans only: what this shop actually pays, and any limit overrides
-- ({"bills_per_month": 500, "staff": 6}). Null means the plan's own limits.
alter table shops add column if not exists plan_price numeric(10, 2);
alter table shops add column if not exists plan_limits jsonb;

-- New shops try everything for 14 days, then settle on Free unless a plan
-- is assigned. Separate from subscription_valid_until, which is how long a
-- PAID plan runs.
alter table shops add column if not exists trial_ends_at date;

-- The owner's own mobile number — how the admin reaches a shop about
-- renewals, and how support calls back. Captured at signup from now on.
alter table shops add column if not exists owner_phone text;

-- Every shop that existed before plans did was getting the full app, so it
-- keeps it: they move to Pro+ rather than silently losing features.
-- Only shops nobody has touched yet: re-running this migration must never
-- push a shop an admin deliberately put on Free back up to Pro +.
update shops set plan = 'pro_plus', plan_note = 'Grandfathered — had full access before plans'
where plan = 'free' and plan_started_at is null and plan_note is null and trial_ends_at is null;

create table if not exists plan_changes (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  from_plan text,
  to_plan text not null,
  amount numeric(10, 2),
  months integer,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_changes_shop on plan_changes(shop_id, created_at desc);

-- What shops ask The Ray for from inside the app: a plan upgrade, a
-- printer, a set-up service, or a feature that isn't built yet ("notify
-- me"). The WhatsApp message goes out either way; this row is what lets
-- the admin see who asked for what, and lets the roadmap follow demand.
create table if not exists sales_enquiries (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null check (kind in ('plan', 'hardware', 'service', 'upcoming', 'custom')),
  item text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz not null default now()
);
create index if not exists idx_sales_enquiries_created on sales_enquiries(created_at desc);
create index if not exists idx_sales_enquiries_shop on sales_enquiries(shop_id, created_at desc);

insert into schema_migrations (version) values ('0040_subscription_plans') on conflict (version) do nothing;
