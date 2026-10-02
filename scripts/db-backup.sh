#!/usr/bin/env bash
# Makes an encrypted backup of The Ray's database: scripts/db-backup.sh <output file>
#
# Needs DB_URL (a Postgres connection string) and BACKUP_PASSPHRASE in the environment, and pg_dump
# at $PG_BIN (or on the PATH). The shop data (schema "public") must dump; the logins (schema "auth")
# are added when the database lets us read them. The dump is in pg_dump's custom format, then
# encrypted with AES-256 using the passphrase. To open one, see docs/BACKUP-RESTORE.md.
set -euo pipefail

out="${1:?usage: db-backup.sh <output file>}"
: "${DB_URL:?DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
if [ "${#BACKUP_PASSPHRASE}" -lt 16 ]; then
  echo "BACKUP_PASSPHRASE is too short: use at least 16 characters." >&2
  exit 1
fi

bin="${PG_BIN:-}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

"${bin:+$bin/}pg_dump" "$DB_URL" --format=custom --compress=9 --no-owner --no-privileges --schema=public --file="$work/public.dump"
echo "shop data: $(stat -c %s "$work/public.dump") bytes"

if "${bin:+$bin/}pg_dump" "$DB_URL" --format=custom --compress=9 --no-owner --no-privileges --schema=auth --data-only --file="$work/auth.dump" 2>"$work/auth.err"; then
  echo "logins: $(stat -c %s "$work/auth.dump") bytes"
else
  echo "logins could not be read, backing up shop data only: $(head -c 300 "$work/auth.err")"
  rm -f "$work/auth.dump"
fi

# Both dumps travel as one file.
tar -C "$work" -cf "$work/backup.tar" $(cd "$work" && ls ./*.dump | xargs -n1 basename)
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$work/backup.tar" -out "$out"

# Check it opens: decrypt again and read the table of contents.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$out" -out "$work/check.tar"
mkdir "$work/check" && tar -C "$work/check" -xf "$work/check.tar"
tables=$("${bin:+$bin/}pg_restore" --list "$work/check/public.dump" | grep -c "TABLE DATA" || true)
echo "backup opens: $tables tables of shop data · $(stat -c %s "$out") bytes encrypted"
if [ "$tables" -lt 1 ]; then
  echo "the backup has no tables" >&2
  exit 1
fi
