-- Vendor "schemes" (buy 10 get 2 free, common in Indian retail/pharma
-- purchasing) — the free units genuinely add to stock but genuinely
-- cost nothing, so they need to be tracked separately from the paid
-- quantity rather than just inflating quantity (which would wrongly
-- suggest they were paid for) or being silently dropped (which would
-- leave stock short of what's actually on the shelf).
alter table purchase_items add column if not exists free_quantity numeric not null default 0;
