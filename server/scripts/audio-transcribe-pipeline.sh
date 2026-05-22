#!/usr/bin/env bash
# Audio transcription pipeline for BCBE meeting videos.
# PRIVATE RESEARCH — do not deploy artifacts publicly.
#
# Prerequisites:
#   Cookie file at ~/yt-cookies.txt OR pre-downloaded audio file already at AUDIO_FILE path.
#
# Usage:
#   bash audio-transcribe-pipeline.sh <video_id> "<title>" "<date_YYYY-MM-DD>"
#
# If audio file already exists (e.g. downloaded locally and scp'd), skips download step.

set -euo pipefail

VIDEO_ID="${1:?Usage: $0 <video_id> <title> <date>}"
TITLE="${2:-unknown}"
DATE="${3:-unknown}"

COOKIES=~/yt-cookies.txt
RESEARCH_DIR="${BOARDVOTES_RESEARCH_DIR:-$HOME/boardvotes-research/bcbe-audio-transcripts}"
VENV="${BCBE_TRANSCRIPTS_VENV:-$PWD/.venv-transcripts}"
AUDIO_FILE="$RESEARCH_DIR/${DATE}_${VIDEO_ID}.m4a"
TRANSCRIPT_FILE="$RESEARCH_DIR/${DATE}_${VIDEO_ID}.txt"
REPORT_FILE="$RESEARCH_DIR/${DATE}_${VIDEO_ID}_report.json"

mkdir -p "$RESEARCH_DIR"

echo "=== BCBE Audio Transcription Pipeline ==="
echo "Video : $VIDEO_ID"
echo "Title : $TITLE"
echo "Date  : $DATE"
echo ""

# ── Step 1: Download audio (skip if file already exists) ─────────────────────
if [[ -f "$AUDIO_FILE" ]]; then
  SIZE=$(du -sh "$AUDIO_FILE" | cut -f1)
  echo "✓ Audio already present: $AUDIO_FILE ($SIZE) — skipping download"
elif [[ -f "$COOKIES" ]]; then
  echo "Downloading full audio..."
  yt-dlp \
    --cookies "$COOKIES" \
    --js-runtimes node \
    --format "bestaudio[ext=m4a]/bestaudio" \
    --no-playlist --no-warnings --quiet \
    --output "$AUDIO_FILE" \
    "https://www.youtube.com/watch?v=$VIDEO_ID" || true
  if [[ ! -f "$AUDIO_FILE" ]]; then
    echo "ERROR: Audio download failed — VPS IP may be blocked by YouTube."
    echo "  Download locally: bash server/scripts/download-audio-local.sh"
    echo "  Then scp to: $AUDIO_FILE"
    exit 1
  fi
  SIZE=$(du -sh "$AUDIO_FILE" | cut -f1)
  echo "✓ Audio downloaded: $AUDIO_FILE ($SIZE)"
else
  echo "ERROR: No audio file and no cookie file found."
  echo "  Either scp the audio file to: $AUDIO_FILE"
  echo "  Or provide cookies at: $COOKIES"
  exit 1
fi

# ── Step 2: Transcribe ────────────────────────────────────────────────────────
echo ""
echo "Transcribing with faster-whisper (base.en model)..."

"$VENV/bin/python" - \
  "$AUDIO_FILE" "$TRANSCRIPT_FILE" "$REPORT_FILE" \
  "$VIDEO_ID" "$TITLE" "$DATE" << 'PYEOF'

import sys, json, re
from faster_whisper import WhisperModel
import psycopg2
from datetime import date as date_type, timedelta

audio_file, transcript_file, report_file, video_id, title, date = sys.argv[1:]
DB_DSN = "postgresql:///bcbe_votes?host=/var/run/postgresql"

# ── Detection patterns ────────────────────────────────────────────────────────

PRAYER_KEYWORDS = [
    "pray", "prayer", "lord", "god", "father", "heavenly", "bless", "amen",
    "invocation", "almighty", "jesus", "christ", "holy spirit",
    "guidance", "wisdom", "grace", "mercy", "protect", "faithful",
    "scripture", "bible", "thy", "thou", "thee", "unto",
]

VOICE_VOTE_TRIGGERS = [
    "all in favor", "all those in favor", "any opposed", "any objection",
    "hearing none", "motion carries", "motion failed", "motion passes",
    "so ordered", "call the vote", "voice vote", "show of hands",
    "those in favor say aye", "opposed say nay", "opposed say no",
    "ayes have it", "nays have it",
]

EXEC_SESSION_TRIGGERS = [
    "executive session", "closed session", "go into executive",
    "enter executive", "convene in executive", "recess into",
    "pursuant to", "alabama open meetings",
]

EXEC_SESSION_REASONS = [
    "real estate", "pending litigation", "potential litigation",
    "possible litigation", "good name and character", "character",
    "personnel matter", "employment", "legal counsel",
]

MOTION_TRIGGERS = [
    "i move", "i so move", "make a motion", "motion to",
    "i'd like to move", "i would like to move",
]

SECOND_TRIGGERS = [
    "i second", "second the motion", "i'll second", "so seconded",
]

def fmt_time(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"

# ── Transcribe ────────────────────────────────────────────────────────────────
print("  Loading model (base.en)...")
model = WhisperModel("base.en", device="cpu", compute_type="int8")

print("  Transcribing full audio...")
segments_iter, info = model.transcribe(
    audio_file, beam_size=5, language="en",
    vad_filter=True, word_timestamps=False,
)

all_segments = []
for seg in segments_iter:
    all_segments.append({
        "start": round(seg.start, 1),
        "end":   round(seg.end, 1),
        "text":  seg.text.strip(),
    })

full_text = " ".join(s["text"] for s in all_segments)
word_count = len(full_text.split())
duration   = round(info.duration, 1)

# ── Prayer detection (first 5 min) ───────────────────────────────────────────
first5 = " ".join(s["text"] for s in all_segments if s["start"] < 300)
prayer_hits = [kw for kw in PRAYER_KEYWORDS if kw in first5.lower()]
prayer_detected = len(prayer_hits) >= 2

# ── Voice vote detection ──────────────────────────────────────────────────────
voice_votes = []
for seg in all_segments:
    lower = seg["text"].lower()
    matched = [t for t in VOICE_VOTE_TRIGGERS if t in lower]
    if matched:
        # grab surrounding context (±1 segment)
        idx = all_segments.index(seg)
        ctx_segs = all_segments[max(0, idx-1) : idx+3]
        ctx_text = " ".join(s["text"] for s in ctx_segs)
        voice_votes.append({
            "time":    fmt_time(seg["start"]),
            "trigger": matched[0],
            "context": ctx_text[:300],
        })

# ── Executive session detection ───────────────────────────────────────────────
exec_session_blocks = []
for i, seg in enumerate(all_segments):
    lower = seg["text"].lower()
    if any(t in lower for t in EXEC_SESSION_TRIGGERS):
        ctx_segs = all_segments[max(0, i-1) : i+5]
        ctx_text = " ".join(s["text"] for s in ctx_segs)
        reasons_found = [r for r in EXEC_SESSION_REASONS if r in ctx_text.lower()]
        exec_session_blocks.append({
            "time":    fmt_time(seg["start"]),
            "context": ctx_text[:500],
            "reasons": reasons_found,
        })

exec_detected = len(exec_session_blocks) > 0

# ── Motion / second detection ─────────────────────────────────────────────────
motions = []
for i, seg in enumerate(all_segments):
    lower = seg["text"].lower()
    if any(t in lower for t in MOTION_TRIGGERS + SECOND_TRIGGERS):
        ctx_segs = all_segments[max(0, i-1) : i+3]
        ctx_text = " ".join(s["text"] for s in ctx_segs)
        kind = "motion" if any(t in lower for t in MOTION_TRIGGERS) else "second"
        motions.append({
            "time":    fmt_time(seg["start"]),
            "kind":    kind,
            "context": ctx_text[:300],
        })

# ── Write transcript file ─────────────────────────────────────────────────────
with open(transcript_file, "w") as f:
    f.write(f"VIDEO:    {video_id}\n")
    f.write(f"TITLE:    {title}\n")
    f.write(f"DATE:     {date}\n")
    f.write(f"DURATION: {fmt_time(duration)}  WORDS: {word_count}\n\n")
    f.write("=== TIMED TRANSCRIPT ===\n\n")
    for seg in all_segments:
        f.write(f"[{fmt_time(seg['start'])}]  {seg['text']}\n")

# ── DB store ──────────────────────────────────────────────────────────────────
def find_meeting_id(conn, date_str):
    try:
        d = date_type.fromisoformat(date_str)
    except ValueError:
        return None
    for delta in [0, -1, 1, -2, 2]:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM meetings WHERE date::date = %s ORDER BY id LIMIT 1",
                (d + timedelta(days=delta),)
            )
            row = cur.fetchone()
            if row:
                return row[0]
    return None

all_exec_phrases = list({r for b in exec_session_blocks for r in b["reasons"]})
first5_text = " ".join(s["text"] for s in all_segments if s["start"] < 300)

try:
    conn = psycopg2.connect(DB_DSN)
    meeting_id = find_meeting_id(conn, date)
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO meeting_transcripts
                (meeting_id, video_id, video_title, meeting_date, audio_file,
                 transcript_text, transcript_first5min, word_count, duration_seconds,
                 model, prayer_detected, exec_session_detected, exec_session_phrases,
                 voice_votes, exec_session_context, motions_detected, timed_segments)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (video_id) DO UPDATE SET
                transcript_text       = EXCLUDED.transcript_text,
                transcript_first5min  = EXCLUDED.transcript_first5min,
                word_count            = EXCLUDED.word_count,
                duration_seconds      = EXCLUDED.duration_seconds,
                prayer_detected       = EXCLUDED.prayer_detected,
                exec_session_detected = EXCLUDED.exec_session_detected,
                exec_session_phrases  = EXCLUDED.exec_session_phrases,
                voice_votes           = EXCLUDED.voice_votes,
                exec_session_context  = EXCLUDED.exec_session_context,
                motions_detected      = EXCLUDED.motions_detected,
                timed_segments        = EXCLUDED.timed_segments,
                updated_at            = NOW()
        """, (
            meeting_id, video_id, title,
            date_type.fromisoformat(date) if date != "unknown" else None,
            audio_file, full_text, first5_text,
            word_count, duration,
            "faster-whisper/base.en",
            prayer_detected, exec_detected,
            all_exec_phrases if all_exec_phrases else None,
            json.dumps(voice_votes) if voice_votes else None,
            json.dumps(exec_session_blocks) if exec_session_blocks else None,
            json.dumps(motions) if motions else None,
            json.dumps([{"t": s["start"], "text": s["text"]} for s in all_segments]),
        ))
    conn.commit()
    conn.close()
    print(f"  ✓ Stored in DB  meeting_id={meeting_id}")
except Exception as e:
    print(f"  WARN: DB store failed: {e}")

# ── Report ────────────────────────────────────────────────────────────────────
report = {
    "video_id":              video_id,
    "title":                 title,
    "date":                  date,
    "duration":              fmt_time(duration),
    "word_count":            word_count,
    "audio_file":            audio_file,
    "transcript_file":       transcript_file,
    "prayer_detected":       prayer_detected,
    "prayer_keyword_hits":   prayer_hits if prayer_detected else [],
    "exec_session_detected": exec_detected,
    "exec_session_count":    len(exec_session_blocks),
    "exec_session_times":    [b["time"] for b in exec_session_blocks],
    "exec_reasons_found":    all_exec_phrases,
    "voice_vote_count":      len(voice_votes),
    "voice_vote_times":      [v["time"] for v in voice_votes],
    "motion_count":          len(motions),
    "model":                 "faster-whisper/base.en",
}
with open(report_file, "w") as f:
    json.dump(report, f, indent=2)

print(f"\n  Duration        : {fmt_time(duration)}")
print(f"  Words           : {word_count}")
print(f"  Prayer detected : {'YES' if prayer_detected else 'no'}")
if prayer_detected:
    print(f"  Prayer keywords : {', '.join(prayer_hits)}  (text stored privately)")
print(f"  Exec sessions   : {len(exec_session_blocks)}")
for b in exec_session_blocks:
    print(f"    [{b['time']}] reasons={b['reasons']}")
print(f"  Voice votes     : {len(voice_votes)}")
for v in voice_votes[:5]:
    print(f"    [{v['time']}] {v['trigger']}")
print(f"  Motions         : {len(motions)}")

PYEOF

echo ""
echo "=== Summary Report ==="
python3 -c "
import json, sys
r = json.load(open('$REPORT_FILE'))
for k,v in r.items():
    if k not in ('audio_file','transcript_file'):
        print(f'  {k}: {v}')
"
echo ""
echo "Private artifacts:"
echo "  $AUDIO_FILE"
echo "  $TRANSCRIPT_FILE"
echo "  $REPORT_FILE"
