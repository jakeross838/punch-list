#!/usr/bin/env bash
# Applies the migrations to a fresh local Postgres, loads the test job, and runs the database checks.
#   npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

as_pg() { runuser -u postgres -- "$@"; }
DB="punch_test_$(date +%s)_$$"
as_pg createdb "$DB"
trap 'as_pg dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
run() { as_pg psql -X -q -v ON_ERROR_STOP=1 -d "$DB" < "$1"; }

run supabase/test/local-stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/seed/test_job.sql
run supabase/test/rules.sql
