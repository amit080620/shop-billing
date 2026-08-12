# Database Migrations

## How this works from now on

`supabase/schema.sql` (one folder up) is the **baseline snapshot** — the
full schema as of Phase 3 of the production-hardening pass. It's still
safe to run top-to-bottom on a fresh database; every statement in it
uses `if not exists` / `if not exists`-equivalent guards.

**From this point forward, every schema change gets its own numbered
file in this folder** instead of being appended to the bottom of
`schema.sql` forever. This gives:

- A real history of what changed and when, instead of one growing file
- The ability to see exactly what's pending on a database that's behind
- A natural place to note *why* a change was made (each file should
  have the same kind of comment schema.sql itself uses)

## Naming

```
0001_short_description.sql
0002_another_change.sql
```

Zero-padded, sequential, one migration = one logical change. Never edit
a migration file after it's been applied anywhere — write a new one
that corrects it instead, the same way you'd never rewrite git history
that's already been pushed.

## Applying a migration

Run the new file's SQL in the Supabase SQL editor (same as always),
then record that it's applied:

```sql
insert into schema_migrations (version) values ('0001_short_description')
on conflict (version) do nothing;
```

## Checking what's applied

```sql
select version, applied_at from schema_migrations order by applied_at;
```

## Known limitation

This is intentionally lightweight — there's no automated migration
runner (no CI step that applies pending migrations on deploy). Migrations
are still applied by hand in the Supabase SQL editor, same as
`schema.sql` always has been. What changed is that new work is now
broken into reviewable, individually-tracked files instead of one
undifferentiated block, which is the main practical gap this closes for
a small team without over-engineering a full migration pipeline this
project doesn't yet have the deploy infrastructure to support.
