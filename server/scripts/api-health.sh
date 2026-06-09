#!/usr/bin/env bash
# api-health.sh — boardvotes.io API health check (every 15 min via cron)
# Checks all key API endpoints for: HTTP status, response latency, valid JSON.
#
# Usage: bash server/scripts/api-health.sh

set -uo pipefail

BASE="https://boardvotes.io/api"
TIMEOUT=15
LATENCY_WARN_MS=1000   # warn if response > 1s
LATENCY_FAIL_MS=5000   # fail if response > 5s
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
OVERALL_PASS=0
OVERALL_FAIL=0

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

echo ""
echo "boardvotes.io API Health  ${TIMESTAMP}"
hr

# ── Check a single endpoint ───────────────────────────────────────────────────
check_endpoint() {
  local label="$1"
  local url="$2"
  local expect_json="${3:-true}"

  # Capture body + metrics in one request
  local tmpfile
  tmpfile=$(mktemp /tmp/api-health-XXXXXX.json)
  # shellcheck disable=SC2064
  trap "rm -f '$tmpfile'" RETURN

  local metrics
  metrics=$(curl -s \
    --max-time "$TIMEOUT" \
    -H "Accept: application/json" \
    -H "User-Agent: boardvotes-api-health/1.0" \
    -w '%{http_code} %{time_total}' \
    -o "$tmpfile" \
    "$url" 2>/dev/null || echo "000 0")

  local code total_t
  code=$(echo "$metrics" | awk '{print $1}')
  total_t=$(echo "$metrics" | awk '{print $2}')

  local ms
  ms=$(echo "$total_t * 1000" | bc 2>/dev/null | cut -d. -f1 || echo 9999)

  local status_icon latency_icon json_icon="  "
  local failed=0

  # HTTP status check
  if [ "$code" = "200" ]; then
    status_icon="PASS"
  else
    status_icon="FAIL"
    failed=1
  fi

  # Latency check
  if [ "${ms:-9999}" -ge "$LATENCY_FAIL_MS" ]; then
    latency_icon="SLOW"
    failed=1
  elif [ "${ms:-9999}" -ge "$LATENCY_WARN_MS" ]; then
    latency_icon="WARN"
  else
    latency_icon="fast"
  fi

  # JSON validity check
  if [ "$expect_json" = "true" ] && [ "$code" = "200" ]; then
    if command -v jq &>/dev/null; then
      if jq empty "$tmpfile" 2>/dev/null; then
        json_icon="json-ok"
      else
        json_icon="JSON-ERR"
        failed=1
      fi
    else
      # fallback: check first char is { or [
      local first_char
      first_char=$(head -c1 "$tmpfile" 2>/dev/null || echo "?")
      if [[ "$first_char" == "{" || "$first_char" == "[" ]]; then
        json_icon="json-ok"
      else
        json_icon="not-json"
        failed=1
      fi
    fi
  fi

  if [ "$failed" -eq 1 ]; then
    echo "  FAIL  [HTTP ${code}] [${total_t}s ${latency_icon}] [${json_icon}]  ${label}"
    OVERALL_FAIL=$((OVERALL_FAIL+1))
  else
    echo "  PASS  [HTTP ${code}] [${total_t}s ${latency_icon}] [${json_icon}]  ${label}"
    OVERALL_PASS=$((OVERALL_PASS+1))
  fi
}

# ── Endpoints to check ────────────────────────────────────────────────────────
echo ""
echo "Checking API endpoints:"
hr

check_endpoint "health"                           "${BASE}/health"
check_endpoint "votes (page 1)"                   "${BASE}/votes?page=1&limit=10"
check_endpoint "votes (page 2)"                   "${BASE}/votes?page=2&limit=10"
check_endpoint "vote detail (first)"              "${BASE}/votes/1"               true
check_endpoint "members"                          "${BASE}/members"
check_endpoint "meetings (page 1)"                "${BASE}/meetings?page=1&limit=5"
check_endpoint "stats / analytics"                "${BASE}/stats"
check_endpoint "alliances"                        "${BASE}/alliances"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
hr
echo "Results: ${OVERALL_PASS} passed, ${OVERALL_FAIL} failed"
if [ "$OVERALL_FAIL" -eq 0 ]; then
  echo "STATUS: PASS — all API endpoints healthy"
  exit 0
else
  echo "STATUS: FAIL — ${OVERALL_FAIL} endpoint(s) need attention"
  exit 1
fi
