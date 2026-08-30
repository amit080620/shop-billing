-- The network-effect foundation: a customer's udhar-reliability
-- signal, aggregated ACROSS every shop on The Ray that has billed
-- them — but deliberately storing only a coarse tier and counts,
-- NEVER any rupee amount, shop name, or shop identity. A shop looking
-- up a phone number can see "this customer is Trusted across 3
-- shops" and nothing more specific than that — genuinely useful
-- (a new customer with a strong track record elsewhere is a safer bet
-- to extend credit to) without ever leaking one shop's business into
-- another's.
create table if not exists customer_network_profiles (
  phone text primary key,
  shops_visited_count int not null default 0,
  reliability_tier text not null default 'new' check (reliability_tier in ('new', 'building', 'trusted')),
  last_computed_at timestamptz not null default now()
);

alter table customer_network_profiles enable row level security;
