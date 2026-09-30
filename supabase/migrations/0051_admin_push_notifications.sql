-- Notifications to The Ray's own team: a phone that turns them on in the admin panel gets a push
-- notification when a shop raises a support request (SR), asks to upgrade, or signs up.
--
-- admin_push_subscriptions — each phone or browser that turned notifications on.
-- app_secrets              — the platform's own keys (here the push "VAPID" key pair, made once
--                            on first use), readable only by the server.

create table if not exists admin_push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

-- Only the server (service role) reads or writes these.
alter table admin_push_subscriptions enable row level security;
alter table app_secrets enable row level security;
