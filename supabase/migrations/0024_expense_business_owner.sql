-- Genuinely add the Business vs Owner expense distinction to the
-- existing Petty Cash feature — this is what turns it into the
-- "Record Expense → Business Expense / Owner Expense" hierarchy,
-- without building a duplicate parallel system. Every existing entry
-- genuinely defaults to 'business' (the original, only behaviour),
-- so nothing about past data changes.
alter table petty_cash_entries add column if not exists expense_type text not null default 'business' check (expense_type in ('business', 'owner'));
alter table petty_cash_entries add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'upi', 'online', 'other'));
alter table petty_cash_entries add column if not exists bill_image_url text;
