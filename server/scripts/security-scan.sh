#!/usr/bin/env bash
# security-scan.sh — boardvotes.io daily security scan
# Parses nginx access logs for the last 24 hours and reports threat indicators.
# Run as root or via sudo for log access.

set -euo pipefail

LOG_FILE="/var/log/nginx/access.log"
LOG_FILE_1="/var/log/nginx/access.log.1"   # yesterday's rotated log
HOURS=24
REPORT_DATE=$(date '+%Y-%m-%d %H:%M:%S')
THRESHOLD_REQUESTS=100   # flag IPs exceeding this many requests
THRESHOLD_404=20         # flag IPs with this many 404s

# ANSI colors (suppressed if not a tty)
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

echo ""
echo -e "${BOLD}boardvotes.io Security Scan${RESET}  ${REPORT_DATE}"
hr

# ── Build a combined log for the last 24 hours ────────────────────────────────
# nginx combined log format: IP - user [DD/Mon/YYYY:HH:MM:SS +TZTZ] "METHOD /path HTTP/x" STATUS bytes "ref" "ua"

CUTOFF_EPOCH=$(date -d "-${HOURS} hours" '+%s')

# Helper: convert nginx log timestamp to epoch
# "10/May/2026:01:23:45 +0000" → epoch
parse_epoch() {
  local ts="$1"
  # ts format: DD/Mon/YYYY:HH:MM:SS
  local day month year hms
  day="${ts%%/*}"; rest="${ts#*/}"
  month="${rest%%/*}"; rest="${rest#*/}"
  year="${rest%%:*}"; hms="${rest#*:}"
  # Map month abbreviation to number
  case "$month" in
    Jan) month=01;; Feb) month=02;; Mar) month=03;; Apr) month=04;;
    May) month=05;; Jun) month=06;; Jul) month=07;; Aug) month=08;;
    Sep) month=09;; Oct) month=10;; Nov) month=11;; Dec) month=12;;
  esac
  date -d "${year}-${month}-${day} ${hms}" '+%s' 2>/dev/null || echo 0
}

# Collect lines from current log (and rotated log) that fall in the window.
# Use awk for speed — parse the timestamp field directly.
TMPLOG=$(mktemp /tmp/nginx-scan-XXXXXX.log)
trap 'rm -f "$TMPLOG"' EXIT

filter_log() {
  local file="$1"
  [ -r "$file" ] || return 0
  awk -v cutoff="$CUTOFF_EPOCH" '
  {
    # Field 4 is [DD/Mon/YYYY:HH:MM:SS — strip the leading [
    ts = substr($4, 2)   # e.g. 10/May/2026:01:23:45
    split(ts, d, "/")    # d[1]=day, d[2]=Mon, d[3]=YYYY:HH:MM:SS
    split(d[3], dt, ":")
    yr = dt[1]; hh = dt[2]; mm = dt[3]; ss = dt[4]
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec"
    mo_num = 1
    n = split(months, mo_arr, " ")
    for (i = 1; i <= n; i++) { if (mo_arr[i] == d[2]) { mo_num = i; break } }
    mo = sprintf("%02d", mo_num)
    day = sprintf("%02d", d[1])
    ts_str = yr "-" mo "-" day " " hh ":" mm ":" ss
    # Use mktime (requires gawk)
    epoch = mktime(yr " " mo " " day " " hh " " mm " " ss)
    if (epoch >= cutoff) print
  }' "$file" 2>/dev/null
}

filter_log "$LOG_FILE"  >> "$TMPLOG"
filter_log "$LOG_FILE_1" >> "$TMPLOG"

TOTAL_LINES=$(wc -l < "$TMPLOG")
echo -e "  Log window : last ${HOURS} hours"
echo -e "  Log entries: ${TOTAL_LINES}"
echo ""

if [ "$TOTAL_LINES" -eq 0 ]; then
  echo "No log entries found in the last ${HOURS} hours."
  exit 0
fi

# ── Top 10 IPs by request count ───────────────────────────────────────────────
echo -e "${BOLD}Top 10 IPs by Request Count${RESET}"
hr
awk '{print $1}' "$TMPLOG" \
  | sort | uniq -c | sort -rn | head -10 \
  | awk -v thresh="$THRESHOLD_REQUESTS" -v red="$RED" -v reset="$RESET" \
      '{ flag = ($1 > thresh) ? red"  *** HIGH ***"reset : ""; printf "  %6d  %s%s\n", $1, $2, flag }'
echo ""

# ── IPs over threshold ────────────────────────────────────────────────────────
echo -e "${BOLD}IPs Exceeding ${THRESHOLD_REQUESTS} Requests (Potential Scrapers)${RESET}"
hr
HIGH_IPS=$(awk '{print $1}' "$TMPLOG" | sort | uniq -c | sort -rn | awk -v t="$THRESHOLD_REQUESTS" '$1>t')
if [ -z "$HIGH_IPS" ]; then
  echo -e "  ${GREEN}None detected.${RESET}"
else
  echo "$HIGH_IPS" | awk -v red="$RED" -v reset="$RESET" \
    '{ printf "  %s%6d  %s%s\n", red, $1, $2, reset }'
fi
echo ""

# ── 429 Rate-limit hits ───────────────────────────────────────────────────────
echo -e "${BOLD}429 Rate-Limit Hits by IP${RESET}"
hr
HITS_429=$(awk '$9 == "429" {print $1}' "$TMPLOG" | sort | uniq -c | sort -rn | head -10)
if [ -z "$HITS_429" ]; then
  echo -e "  ${GREEN}No 429s recorded.${RESET}"
else
  echo "$HITS_429" | awk '{ printf "  %6d  %s\n", $1, $2 }'
fi
echo ""

# ── 404 scanner detection ─────────────────────────────────────────────────────
echo -e "${BOLD}Top IPs by 404 Count (Potential Scanners, threshold=${THRESHOLD_404})${RESET}"
hr
HITS_404=$(awk '$9 == "404" {print $1}' "$TMPLOG" | sort | uniq -c | sort -rn | head -10)
if [ -z "$HITS_404" ]; then
  echo -e "  ${GREEN}No 404s recorded.${RESET}"
else
  echo "$HITS_404" | awk -v thresh="$THRESHOLD_404" -v yellow="$YELLOW" -v reset="$RESET" \
    '{ flag = ($1 >= thresh) ? yellow"  *** SCANNER ***"reset : ""; printf "  %6d  %s%s\n", $1, $2, flag }'
fi
echo ""

# ── Sensitive path probes ─────────────────────────────────────────────────────
echo -e "${BOLD}Requests to Sensitive Paths${RESET}"
hr
SENSITIVE_PATTERN='\.(env|git|sh|sql|bak|swp|old)|/\.env|/\.git|wp-admin|wp-login|phpMyAdmin|phpmyadmin|/admin/|xmlrpc|/etc/passwd|/proc/self|actuator|\.php|\.asp|setup\.cgi|config\.'
SENSITIVE_HITS=$(grep -iE "$SENSITIVE_PATTERN" "$TMPLOG" 2>/dev/null || true)
if [ -z "$SENSITIVE_HITS" ]; then
  echo -e "  ${GREEN}None detected.${RESET}"
else
  SENSITIVE_COUNT=$(echo "$SENSITIVE_HITS" | wc -l)
  echo -e "  ${RED}${SENSITIVE_COUNT} sensitive-path probe(s) detected:${RESET}"
  echo ""
  # Show unique paths with IP and status
  echo "$SENSITIVE_HITS" \
    | awk '{ip=$1; status=$9; path=$7; print ip, status, path}' \
    | sort -u \
    | head -30 \
    | awk '{ printf "  %-18s  %s  %s\n", $1, $2, $3 }'
fi
echo ""

# ── Status code summary ───────────────────────────────────────────────────────
echo -e "${BOLD}HTTP Status Code Distribution${RESET}"
hr
awk '{print $9}' "$TMPLOG" \
  | grep -E '^[0-9]{3}$' \
  | sort | uniq -c | sort -rn \
  | awk '{ printf "  %6d  HTTP %s\n", $1, $2 }'
echo ""

# ── fail2ban current bans ────────────────────────────────────────────────────
echo -e "${BOLD}Fail2ban Status${RESET}"
hr
if command -v fail2ban-client &>/dev/null; then
  fail2ban-client status 2>/dev/null || echo "  fail2ban not running"
  echo ""
  # Per-jail ban counts
  for jail in $(fail2ban-client status 2>/dev/null | grep 'Jail list' | sed 's/.*Jail list://;s/,/ /g'); do
    echo -e "  Jail: ${CYAN}${jail}${RESET}"
    fail2ban-client status "$jail" 2>/dev/null | grep -E 'Currently banned|Banned IP' || true
  done
else
  echo -e "  ${YELLOW}fail2ban not installed.${RESET}"
fi
echo ""

# ── Threat level summary ─────────────────────────────────────────────────────
echo -e "${BOLD}Threat Level Assessment${RESET}"
hr
THREAT=0
[ -n "$HIGH_IPS" ] && THREAT=$((THREAT + 2))
[ -n "$SENSITIVE_HITS" ] && THREAT=$((THREAT + 2))
RATE_429_COUNT=$(echo "$HITS_429" | grep -c '[0-9]' || true)
[ "$RATE_429_COUNT" -gt 5 ] && THREAT=$((THREAT + 1))
SCANNER_IPS=$(echo "$HITS_404" | awk -v t="$THRESHOLD_404" '$1>=t' | wc -l)
[ "$SCANNER_IPS" -gt 0 ] && THREAT=$((THREAT + 1))

if [ "$THREAT" -ge 4 ]; then
  echo -e "  ${RED}${BOLD}HIGH${RESET} — Active threats detected. Review IPs above and consider manual blocks."
elif [ "$THREAT" -ge 2 ]; then
  echo -e "  ${YELLOW}${BOLD}MEDIUM${RESET} — Suspicious activity. Monitor closely."
else
  echo -e "  ${GREEN}${BOLD}LOW${RESET} — No significant threats detected."
fi
echo ""
hr
echo "Scan complete."
