#!/usr/bin/env bash
# db-health.sh — boardvotes.io nightly database health check
# Checks table sizes, dead tuple ratios, connection count, and runs
# VACUUM ANALYZE on tables with high dead-tuple ratios.
#
# Requires: psql on PATH, DATABASE_URL env var (or set inline below).
# Usage: bash server/scripts/db-health.sh

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql:///bcbe_votes?host=/var/run/postgresql}"
DEAD_TUPLE_THRESHOLD=1000   # run VACUUM ANALYZE if dead_tup exceeds this
REPORT_DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Load .env if not already set and file exists
if [ -z "${DATABASE_URL:-}" ] && [ -f "/home/jordan/bcbe-votes/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source /home/jordan/bcbe-votes/.env; set +a
fi

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

echo ""
echo "boardvotes.io DB Health Check  ${REPORT_DATE}"
hr

# ── Connection test ────────────────────────────────────────────────────────────
echo ""
echo "Connection test:"
if psql "$DATABASE_URL" -c '\q' 2>&1; then
  echo "  OK — connected to database"
else
  echo "  FAIL — could not connect to database"
  exit 1
fi

# ── Table sizes ───────────────────────────────────────────────────────────────
echo ""
echo "Table sizes (rows + disk):"
hr
psql "$DATABASE_URL" --no-psqlrc -P pager=off -c "
SELECT
  s.relname                                              AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))         AS total_size,
  to_char(s.n_live_tup, 'FM999,999,999')                AS live_rows,
  to_char(s.n_dead_tup, 'FM999,999,999')                AS dead_rows,
  to_char(s.last_vacuum, 'YYYY-MM-DD HH24:MI')          AS last_vacuum,
  to_char(s.last_autovacuum, 'YYYY-MM-DD HH24:MI')      AS last_autovacuum
FROM pg_stat_user_tables s
JOIN pg_class c ON c.relname = s.relname
ORDER BY pg_total_relation_size(c.oid) DESC;
"

# ── Connection count ──────────────────────────────────────────────────────────
echo ""
echo "Active connections:"
hr
psql "$DATABASE_URL" --no-psqlrc -P pager=off -c "
SELECT
  count(*)                              AS total_connections,
  count(*) FILTER (WHERE state = 'active')  AS active,
  count(*) FILTER (WHERE state = 'idle')    AS idle,
  current_setting('max_connections')    AS max_connections
FROM pg_stat_activity
WHERE datname = current_database();
"

# ── Dead tuple check + conditional VACUUM ANALYZE ────────────────────────────
echo ""
echo "Dead tuple check (threshold: ${DEAD_TUPLE_THRESHOLD}):"
hr

BLOATED=$(psql "$DATABASE_URL" --no-psqlrc -P pager=off -t -c "
SELECT s.relname
FROM pg_stat_user_tables s
WHERE s.n_dead_tup > ${DEAD_TUPLE_THRESHOLD}
ORDER BY s.n_dead_tup DESC;
" | tr -d ' ' | grep -v '^$' || true)

if [ -z "$BLOATED" ]; then
  echo "  OK — no tables exceed dead tuple threshold of ${DEAD_TUPLE_THRESHOLD}"
else
  echo "  Tables with high dead tuples:"
  while IFS= read -r table; do
    echo "    - ${table} — running VACUUM ANALYZE..."
    psql "$DATABASE_URL" --no-psqlrc -c "VACUUM ANALYZE ${table};" 2>&1 \
      && echo "      VACUUM ANALYZE ${table}: done" \
      || echo "      VACUUM ANALYZE ${table}: FAILED"
  done <<< "$BLOATED"
fi

# ── Index health ──────────────────────────────────────────────────────────────
echo ""
echo "Index usage (low-usage indexes):"
hr
psql "$DATABASE_URL" --no-psqlrc -P pager=off -c "
SELECT
  i.indexrelname                              AS index_name,
  i.relname                                   AS table_name,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  i.idx_scan                                  AS scans
FROM pg_stat_user_indexes i
JOIN pg_index x ON x.indexrelid = i.indexrelid
WHERE NOT x.indisprimary
  AND NOT x.indisunique
  AND i.idx_scan < 10
ORDER BY i.idx_scan, pg_relation_size(i.indexrelid) DESC
LIMIT 10;
"

# ── Database size summary ─────────────────────────────────────────────────────
echo ""
echo "Database size:"
hr
psql "$DATABASE_URL" --no-psqlrc -P pager=off -c "
SELECT
  datname                             AS database,
  pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE datname = current_database();
"

hr
echo "DB health check complete."
