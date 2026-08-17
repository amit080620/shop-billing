-- Table I/O/T categorization — Inside / Outside / Takeaway.
alter table restaurant_tables add column if not exists section text
  check (section in ('inside', 'outside', 'takeaway'));
