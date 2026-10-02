# Database backups

Every night at 03:00 (India time) GitHub makes a full backup of The Ray's database
(`.github/workflows/db-backup.yml`, `scripts/db-backup.sh`):

- **What:** all shop data (every table in `public`) and the logins (`auth`, when readable).
- **Locked:** encrypted with AES-256 using the `BACKUP_PASSPHRASE` secret. Without that passphrase
  nobody can open it, including us, so keep it written down somewhere safe.
- **Where:** two places, each keeping the last 14 days:
  1. Supabase → Storage → bucket `db-backups` (private).
  2. GitHub → Actions → "Database backup" → a run → Artifacts.
- **Check:** each backup is decrypted again and its tables counted before it is stored. Admin →
  Speed shows when the last one was made.

## Opening a backup

You need `openssl` and the PostgreSQL 17 tools (`pg_restore`, `psql`).

```bash
# 1. Unlock it (asks for nothing; the passphrase goes in the variable)
export BACKUP_PASSPHRASE='the passphrase'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in the-ray-2026-10-03-0300.backup -out backup.tar

# 2. Unpack: public.dump (shop data) and, usually, auth.dump (logins)
mkdir backup && tar -C backup -xf backup.tar

# 3. Look inside without restoring anything
pg_restore --list backup/public.dump | head
```

## Restoring

Into a **new, empty** Supabase project (never over a live one by mistake):

```bash
# Its connection string: Supabase → Connect → Session pooler
export NEW_DB='postgresql://postgres.xxxx:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'

pg_restore --no-owner --no-privileges -d "$NEW_DB" backup/public.dump
pg_restore --no-owner --no-privileges --data-only -d "$NEW_DB" backup/auth.dump   # logins
```

Then point the app at the new project (Vercel environment variables `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and redeploy. Files in storage (logos,
photos) are not in this backup; they stay in the old project's Storage.

A single table can also be read back on its own, e.g. only bills:
`pg_restore --data-only --table=bills -d "$NEW_DB" backup/public.dump`.
