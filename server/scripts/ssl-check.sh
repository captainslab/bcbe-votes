#!/usr/bin/env bash
# ssl-check.sh — boardvotes.io SSL certificate expiry check
# Runs weekly (Mondays 9am). Checks cert expiry via openssl and runs
# certbot renew if the cert expires within 30 days.
#
# Usage: bash server/scripts/ssl-check.sh

set -uo pipefail

DOMAIN="boardvotes.io"
RENEW_THRESHOLD_DAYS=30
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

echo ""
echo "boardvotes.io SSL Certificate Check  ${TIMESTAMP}"
hr

# Get expiry date from live TLS handshake
EXPIRY_RAW=$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -z "$EXPIRY_RAW" ]; then
  echo "  FAIL — could not retrieve certificate from ${DOMAIN}:443"
  exit 1
fi

echo "  Domain    : ${DOMAIN}"
echo "  Expires   : ${EXPIRY_RAW}"

# Days until expiry
EXPIRY_EPOCH=$(date -d "$EXPIRY_RAW" '+%s' 2>/dev/null)
NOW_EPOCH=$(date '+%s')
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

echo "  Days left : ${DAYS_LEFT}"

if [ "$DAYS_LEFT" -lt 0 ]; then
  echo ""
  echo "  CRITICAL — Certificate has EXPIRED! Running certbot renew..."
  sudo certbot renew --non-interactive --quiet 2>&1 \
    && echo "  certbot renew: OK" \
    || echo "  certbot renew: FAILED — manual intervention required"

elif [ "$DAYS_LEFT" -le "$RENEW_THRESHOLD_DAYS" ]; then
  echo ""
  echo "  WARNING — ${DAYS_LEFT} days until expiry (threshold: ${RENEW_THRESHOLD_DAYS} days)"
  echo "  Running certbot renew..."
  sudo certbot renew --non-interactive --quiet 2>&1 \
    && echo "  certbot renew: OK" \
    || echo "  certbot renew: FAILED — manual intervention required"

  # Reload nginx to pick up new cert
  if systemctl is-active --quiet nginx 2>/dev/null; then
    sudo systemctl reload nginx 2>&1 && echo "  nginx reloaded" || echo "  nginx reload FAILED"
  fi

else
  echo ""
  echo "  OK — Certificate is valid for ${DAYS_LEFT} more days. No renewal needed."
fi

hr
echo "SSL check complete."
