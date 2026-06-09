#!/usr/bin/env bash
# performance-audit.sh — boardvotes.io daily performance audit (6am)
# Checks response times, gzip compression, cache headers, and API latency.
#
# Usage: bash server/scripts/performance-audit.sh

set -uo pipefail

SITE_URL="https://boardvotes.io/"
TIMEOUT=20
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
PASS=0
FAIL=0

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }
pass() { echo "  PASS  $*"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $*"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN  $*"; }

echo ""
echo "boardvotes.io Performance Audit  ${TIMESTAMP}"
hr

# ── Helper: curl with full metrics ───────────────────────────────────────────
curl_metrics() {
  local url="$1"
  curl -s -o /dev/null \
    --max-time "$TIMEOUT" \
    -H "Accept-Encoding: gzip, br" \
    -H "User-Agent: boardvotes-perf-audit/1.0" \
    -w '%{http_code} %{time_namelookup} %{time_connect} %{time_starttransfer} %{time_total} %{size_download}' \
    "$url" 2>/dev/null || echo "000 0 0 0 0 0"
}

curl_headers() {
  local url="$1"
  curl -sI --max-time "$TIMEOUT" \
    -H "Accept-Encoding: gzip, br" \
    -H "User-Agent: boardvotes-perf-audit/1.0" \
    "$url" 2>/dev/null || true
}

# ── Main site response time ───────────────────────────────────────────────────
echo ""
echo "Response time — main site:"
hr
read -r code dns_t connect_t ttfb total_t size <<< "$(curl_metrics "$SITE_URL")"

echo "  HTTP status  : ${code}"
echo "  DNS lookup   : ${dns_t}s"
echo "  TCP connect  : ${connect_t}s"
echo "  TTFB         : ${ttfb}s"
echo "  Total time   : ${total_t}s"
echo "  Download size: $((size / 1024)) KB"

if [ "$code" = "200" ]; then
  pass "site returned HTTP 200"
else
  fail "site returned HTTP ${code}"
fi

# TTFB threshold: 1.5s
ttfb_ms=$(echo "$ttfb * 1000" | bc 2>/dev/null | cut -d. -f1 || echo 9999)
if [ "${ttfb_ms:-9999}" -le 1500 ]; then
  pass "TTFB ${ttfb}s <= 1.5s"
else
  fail "TTFB ${ttfb}s exceeds 1.5s threshold"
fi

# ── Gzip check ────────────────────────────────────────────────────────────────
echo ""
echo "Gzip / Brotli compression:"
hr
SITE_HEADERS=$(curl_headers "$SITE_URL")
CONTENT_ENC=$(echo "$SITE_HEADERS" | grep -i '^content-encoding:' | tr -d '\r' || true)
if echo "$CONTENT_ENC" | grep -qiE 'gzip|br|deflate'; then
  pass "compression enabled: ${CONTENT_ENC}"
else
  fail "no content-encoding header — gzip/brotli may not be enabled"
  echo "    Headers received:"
  echo "$SITE_HEADERS" | grep -iE '^(content-|cache-|vary:|server:)' | sed 's/^/    /'
fi

# ── Cache headers ─────────────────────────────────────────────────────────────
echo ""
echo "Cache headers:"
hr
CACHE_CTRL=$(echo "$SITE_HEADERS" | grep -i '^cache-control:' | tr -d '\r' || true)
ETAG=$(echo "$SITE_HEADERS" | grep -i '^etag:' | tr -d '\r' || true)
VARY=$(echo "$SITE_HEADERS" | grep -i '^vary:' | tr -d '\r' || true)

if [ -n "$CACHE_CTRL" ]; then
  pass "cache-control present: ${CACHE_CTRL}"
else
  fail "no cache-control header on main page"
fi

[ -n "$ETAG"  ] && pass "etag present: ${ETAG}"  || warn "no etag header"
[ -n "$VARY"  ] && pass "vary present: ${VARY}"   || warn "no vary header"

# ── API endpoint latencies ────────────────────────────────────────────────────
echo ""
echo "API latency check:"
hr
API_ENDPOINTS=(
  "https://boardvotes.io/api/health"
  "https://boardvotes.io/api/votes?page=1&limit=10"
  "https://boardvotes.io/api/members"
  "https://boardvotes.io/api/meetings?page=1&limit=5"
)
API_THRESHOLD_MS=2000

for ep in "${API_ENDPOINTS[@]}"; do
  read -r ep_code _ _ ep_ttfb ep_total _ <<< "$(curl_metrics "$ep")"
  ep_ms=$(echo "$ep_total * 1000" | bc 2>/dev/null | cut -d. -f1 || echo 9999)
  if [ "$ep_code" = "200" ] && [ "${ep_ms:-9999}" -le "$API_THRESHOLD_MS" ]; then
    pass "${ep_total}s  ${ep}"
  elif [ "$ep_code" != "200" ]; then
    fail "HTTP ${ep_code}  ${ep}"
  else
    fail "${ep_total}s > ${API_THRESHOLD_MS}ms threshold  ${ep}"
  fi
done

# ── Security headers ──────────────────────────────────────────────────────────
echo ""
echo "Security headers:"
hr
for hdr in "x-frame-options" "x-content-type-options" "strict-transport-security" "content-security-policy"; do
  val=$(echo "$SITE_HEADERS" | grep -i "^${hdr}:" | tr -d '\r' || true)
  if [ -n "$val" ]; then
    pass "${hdr}"
  else
    warn "${hdr} not set"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
hr
echo "Results: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -eq 0 ]; then
  echo "STATUS: PASS"
else
  echo "STATUS: FAIL"
  exit 1
fi
