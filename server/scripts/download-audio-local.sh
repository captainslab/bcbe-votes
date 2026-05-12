#!/usr/bin/env bash
# Run this on your LOCAL machine (not VPS) — YouTube blocks VPS IPs.
# Downloads full meeting audio for all 43 BCBE videos in the 1.5-year window.
#
# Usage:
#   bash download-audio-local.sh
#   scp -r bcbe-audio jordan@boardvotes.io:/home/jordan/boardvotes-research/bcbe-audio-transcripts/
#
# Then on VPS, run pipeline for each file:
#   bash server/scripts/audio-transcribe-pipeline.sh <video_id> "<title>" "<date>"
# Or use the batch runner:
#   bash server/scripts/batch-transcribe.sh

mkdir -p bcbe-audio

# Format: VIDEO_ID | TITLE | DATE
VIDEOS=(
  "A-TrVE-Sm5s|11/21/24 Board Meeting|2024-11-21"
  "3nTf0OBG3qA|December 10 2024 Regular Meeting|2024-12-10"
  "7XhT8vRWGkw|BCBE Board Meeting 01/16/2025|2025-01-16"
  "FeX2GseGvY8|February 20 2025|2025-02-20"
  "yFXBpdcj7EM|March 20 2025 Part 2|2025-03-20"
  "BpkV_eg55Sw|March 20 2025|2025-03-20"
  "tMmLPf_03uQ|April 22 2025 Work Session|2025-04-22"
  "nvDnEwWa6xI|April 24 2025|2025-04-24"
  "gsgViMdiHmY|April 24 2025 (2)|2025-04-24"
  "8ZVJC385j4w|May 22 2025|2025-05-22"
  "btC-WX0Rqjg|May 22 2025 Part 2|2025-05-22"
  "NFfYXOADAtI|June 17 2025 Work Session|2025-06-17"
  "P46_9X5i-9M|July 15 2025|2025-07-15"
  "sWM3jQ_Mjjk|July 17 2025|2025-07-17"
  "MgZ9c97cHRk|July 17 2025 (2)|2025-07-17"
  "z3V8JA_bwEo|August 28 2025 early|2025-08-28"
  "yc9X40VvvOQ|July 17 2025 (3)|2025-07-17"
  "a17UY9yZfOo|July 29 2025|2025-07-29"
  "tkjyrBtYhwQ|Work Session 08/19/2025|2025-08-19"
  "L-DlKHZVJno|August 21 2025|2025-08-21"
  "OoBWV2QLpnQ|August 28 2025|2025-08-28"
  "7TkLl8yIa-o|August 25 2025 Budget Hearing|2025-08-25"
  "DYWQyV6pa4c|BCBE Work Session 9-23-2025|2025-09-23"
  "9Wk_BiDv3mU|BCBE Board Meeting 9/25/2025|2025-09-25"
  "gpJ5LOriqg4|BCBOE Work Session 10/21/2025|2025-10-21"
  "kHLM2qRcdkY|BCBE Board Meeting 10/23/2025|2025-10-23"
  "HsB4yLKWJgw|November 18 2025 Work Session|2025-11-18"
  "cNS5k5K778I|BCBOE Work Session 11/18/2025|2025-11-18"
  "uNf2EfefQ34|BCBE Board Meeting 11/20/2025|2025-11-20"
  "_FQRTh0MhXw|BCBE Work+Meeting 12/11/2025 Pt2|2025-12-11"
  "QfEI5e4WbZY|BCBE Work Session 12/11/2025|2025-12-11"
  "fLcRHMwRuEg|Jan 7 2026 Special Board Meeting|2026-01-07"
  "EP8_zabnk9Y|BCBE Work Session 01/13/2026|2026-01-13"
  "9wOFb5awY5s|BCBE Board Meeting 01/15/2026|2026-01-15"
  "ip0CTxLTBOo|BCBE Work Session 02/19/2026|2026-02-19"
  "IyI-berbhro|March 17 2026|2026-03-17"
  "yrtIAGLRWss|March 17 2026 (2)|2026-03-17"
  "SIIMToNczds|March 17 2026 (3)|2026-03-17"
  "KVIuFbUF2qc|March 19 2026|2026-03-19"
  "U9LNBVf9bY8|March 19 2026 (2)|2026-03-19"
  "dXNFrv8j-fI|BCBE Special Board Meeting 04/07/2026|2026-04-07"
  "MEdsEMi0tNs|Work Session 4-21-26|2026-04-21"
  "Rq-PyNhH7_w|BCBE Board Meeting April 23 2026|2026-04-23"
)

TOTAL=${#VIDEOS[@]}
SUCCESS=0
SKIP=0
FAIL=0

for entry in "${VIDEOS[@]}"; do
  IFS='|' read -r VID TITLE DATE <<< "$entry"
  OUT="bcbe-audio/${DATE}_${VID}.m4a"

  if [[ -f "$OUT" ]]; then
    echo "[$((SKIP+SUCCESS+FAIL+1))/$TOTAL] SKIP (exists): $DATE $TITLE"
    ((SKIP++)) || true
    continue
  fi

  echo "[$((SKIP+SUCCESS+FAIL+1))/$TOTAL] Downloading: $DATE  $TITLE"
  if yt-dlp \
      --format "bestaudio[ext=m4a]/bestaudio" \
      --no-playlist --no-warnings --quiet \
      --output "$OUT" \
      "https://www.youtube.com/watch?v=$VID" 2>&1; then
    echo "  → $(du -sh "$OUT" 2>/dev/null | cut -f1)"
    ((SUCCESS++)) || true
  else
    echo "  → FAILED (unavailable or private)"
    ((FAIL++)) || true
  fi
done

echo ""
echo "=== Done ==="
echo "  Downloaded : $SUCCESS"
echo "  Skipped    : $SKIP"
echo "  Failed     : $FAIL"
echo ""
echo "Next:"
echo "  scp -r bcbe-audio jordan@boardvotes.io:/home/jordan/boardvotes-research/bcbe-audio-transcripts/"
