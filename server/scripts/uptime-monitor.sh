#!/usr/bin/env bash
# uptime-monitor.sh — boardvotes.io uptime check (runs every 5 min via cron)
# Checks the main site and /api/health. On non-200, restarts bcbe-votes-api
# and/or nginx and logs the incident.

set -uo pipefail

SITE_URL="https://boardvotes.io/"
API_URL="https://boardvotes.io/api/health"
TIMEOUT=10
LOG_DIR="/home/jordan/bcbe-votes/logs"
INCIDENT_LOG="${LOG_DIR}/uptime-incidents.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$LOG_DIR"

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

check_url() {
  local url="$1"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  echo "$code"
}

SITE_CODE=$(check_url "$SITE_URL")
API_CODE=$(check_url "$API_URL")

echo "[${TIMESTAMP}] site=${SITE_CODE} api=${API_CODE}"

FAIL=0

if [ "$SITE_CODE" != "200" ]; then
  echo "  ALERT: ${SITE_URL} returned ${SITE_CODE} (expected 200)"
  echo "[${TIMESTAMP}] ALERT site=${SITE_CODE}" >> "$INCIDENT_LOG"
  FAIL=1
fi

if [ "$API_CODE" != "200" ]; then
  echo "  ALERT: ${API_URL} returned ${API_CODE} (expected 200)"
  echo "[${TIMESTAMP}] ALERT api=${API_CODE}" >> "$INCIDENT_LOG"
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  echo "  Attempting service restarts..."

  # Restart the Node API service
  if systemctl is-active --quiet bcbe-votes-api 2>/dev/null; then
    echo "  Restarting bcbe-votes-api..."
    sudo systemctl restart bcbe-votes-api 2>&1 \
      && echo "  bcbe-votes-api restarted OK" \
      || echo "  bcbe-votes-api restart FAILED (may need sudo)"
    echo "[${TIMESTAMP}] ACTION restarted bcbe-votes-api" >> "$INCIDENT_LOG"
  else
    echo "  bcbe-votes-api service not found or inactive — skipping restart"
  fi

  # Restart nginx if site is down (API is behind nginx)
  if [ "$SITE_CODE" != "200" ]; then
    if systemctl is-active --quiet nginx 2>/dev/null; then
      echo "  Restarting nginx..."
      sudo systemctl restart nginx 2>&1 \
        && echo "  nginx restarted OK" \
        || echo "  nginx restart FAILED (may need sudo)"
      echo "[${TIMESTAMP}] ACTION restarted nginx" >> "$INCIDENT_LOG"
    else
      echo "  nginx service not found or inactive — skipping restart"
    fi
  fi

  # Re-check after restart
  sleep 5
  SITE_CODE2=$(check_url "$SITE_URL")
  API_CODE2=$(check_url "$API_URL")
  echo "  Post-restart check: site=${SITE_CODE2} api=${API_CODE2}"
  echo "[${TIMESTAMP}] POST-RESTART site=${SITE_CODE2} api=${API_CODE2}" >> "$INCIDENT_LOG"
else
  echo "  All checks passed."
fi
