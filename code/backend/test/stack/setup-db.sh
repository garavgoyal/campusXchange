#!/usr/bin/env bash
# Creates a fresh test database with the shim, every migration in order, and
# Supabase's default grants. Used by CI and for running the tests locally.
#
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
#     TEST_DB=cx_test bash ./test/stack/setup-db.sh
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:---client-min-messages=warning}"
here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../../../../supabase/migrations"
db="${TEST_DB:-cx_test}"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $db"
# Roles are cluster-wide: only create them the first time.
if [ "$(psql -tAq -d postgres -c "select 1 from pg_roles where rolname='authenticator'")" != "1" ]; then
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login noinherit password 'authenticator'; grant anon, authenticated, service_role to authenticator;"
fi
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $db"
psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$here/supabase-shim.sql"
for f in "$migrations"/[0-9][0-9][0-9]_*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$f" > /dev/null
done
psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$here/supabase-grants.sql"
echo "test database $db ready"
