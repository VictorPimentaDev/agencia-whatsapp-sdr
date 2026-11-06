#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${PG_TEST_URL:-}" ]]; then
  pg_bin="$(pg_config --bindir)"
  test_dir="$(mktemp -d /tmp/agency-db.XXXXXX)"
  trap '"$pg_bin/pg_ctl" -D "$test_dir/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$test_dir"' EXIT
  "$pg_bin/initdb" -D "$test_dir/data" --auth=trust --no-locale >/dev/null
  "$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/log" -o "-k $test_dir -h '' -p 55439" start >/dev/null
  PG_TEST_URL="postgresql:///postgres?host=$test_dir&port=55439"
fi
psql "$PG_TEST_URL" -X -v ON_ERROR_STOP=1 -f tests/bootstrap.sql -f supabase/migrations/202611060001_crm.sql -f supabase/seed.sql -f tests/database.sql
