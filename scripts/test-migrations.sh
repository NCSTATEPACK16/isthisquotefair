#!/usr/bin/env bash
# Applies supabase/migrations + seed to a throwaway local Postgres and runs supabase/tests/rls.sql.
# Needs Postgres ≥ 15 binaries on PATH (or PG_BIN). Doesn't need Docker or the Supabase CLI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DIR="$(mktemp -d)"
PORT="${PGTEST_PORT:-55432}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUN_AS=(runuser -u postgres --); fi
cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("$PG_BIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate: $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls.sql"
