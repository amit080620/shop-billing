-- 0000_baseline.sql
-- Marks schema.sql (as of Phase 3 of the production-hardening pass) as
-- the baseline. Every migration from here on is numbered 0001+ and
-- lives in its own file — see README.md in this folder.
--
-- Run once, after schema.sql has already been applied:
insert into schema_migrations (version) values ('0000_baseline')
on conflict (version) do nothing;
