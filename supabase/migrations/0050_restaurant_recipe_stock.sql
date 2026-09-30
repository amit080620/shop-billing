-- Restaurant: raw materials, recipes, and the kitchen's stock.
--
-- A. Raw materials. Atta, paneer, oil, tomatoes are items like any other — bought on a purchase,
--    counted in stock — but marked as raw material, so they never appear on the menu or the bill.
--
-- B. Recipes. Each dish says what one plate takes: paneer 0.12 kg, oil 0.02 litre… When a table's
--    order is settled (or a bill is made), the dish's raw materials come off stock by the recipe —
--    a combo by the recipes of what is in it. A voided bill puts them back.
--
-- C. The kitchen's ledger. Every quantity taken off by a recipe is written down, and so is food
--    thrown away and staff meals — so the kitchen can see what went where, and a stock count that
--    comes up short against it shows what went missing.

-- A ─────────────────────────────────────────────────────────────────────
alter table products add column if not exists is_raw_material boolean not null default false;

-- B ─────────────────────────────────────────────────────────────────────
create table if not exists recipe_lines (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  dish_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references products(id) on delete cascade,
  -- In the raw material's own unit (0.12 for 120 g of an item sold by the KG), for one plate.
  quantity numeric(12, 4) not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_recipe_lines_dish_ingredient on recipe_lines (dish_id, ingredient_id);
create index if not exists idx_recipe_lines_shop on recipe_lines (shop_id);

-- A combo on a table's order remembers which combo it was, so its dishes' recipes can be used.
alter table restaurant_order_items add column if not exists combo_id uuid references combos(id) on delete set null;

-- C ─────────────────────────────────────────────────────────────────────
create table if not exists kitchen_usage (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  ingredient_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('sale', 'wastage', 'staff_meal')),
  quantity numeric(12, 4) not null check (quantity > 0),
  order_id uuid references restaurant_orders(id) on delete set null,
  bill_id uuid references bills(id) on delete cascade,
  note text,
  staff_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_kitchen_usage_shop_day on kitchen_usage (shop_id, created_at);
create index if not exists idx_kitchen_usage_bill on kitchen_usage (bill_id);

-- Read and written only by the server (service role), like every other table.
alter table recipe_lines enable row level security;
alter table kitchen_usage enable row level security;
