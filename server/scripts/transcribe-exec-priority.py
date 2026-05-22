#!/usr/bin/env python3
"""
Targeted transcriber for executive-session priority audio files.
PRIVATE RESEARCH — do not deploy artifacts publicly.

Audio files must already exist at:
  {RESEARCH_DIR}/bcbe-exec-audio/{priority_index}_{video_id}.m4a

CSV columns expected: playlist_index (or priority_index), id, title
  Optional column: meeting_date (YYYY-MM-DD override)

Usage:
  python3 transcribe-exec-priority.py [--dry-run] [--only-id VIDEO_ID]
    --dry-run   : print plan, no transcription
    --only-id X : run only for video_id X (proof test)
"""

import os
import sys, csv, re, json, argparse
from datetime import date as date_type, timedelta
from pathlib import Path

RESEARCH_DIR = Path(os.environ.get("BOARDVOTES_RESEARCH_DIR", "~/boardvotes-research/bcbe-audio-transcripts")).expanduser()
AUDIO_DIR    = RESEARCH_DIR / "bcbe-exec-audio"
CSV_PATH     = RESEARCH_DIR / "bcbe-exec-priority-videos.csv"
DB_DSN       = "postgresql:///bcbe_votes?host=/var/run/postgresql"
MODEL_NAME   = "base.en"

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

MOTION_TRIGGERS = ["i move", "i so move", "make a motion", "motion to",
                   "i'd like to move", "i would like to move"]
SECOND_TRIGGERS = ["i second", "second the motion", "i'll second", "so seconded"]


def fmt_time(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


MONTH_MAP = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"oct":10,"nov":11,"dec":12,
}

def parse_date_from_title(title):
    m = re.search(
        r'\b(January|February|March|April|May|June|July|August|September|'
        r'October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
        r'[\s\-]+(\d{1,2})[,\s\-]+(\d{4})\b',
        title, re.IGNORECASE
    )
    if m:
        month_num = MONTH_MAP.get(m.group(1).lower())
        if month_num:
            return f"{m.group(3)}-{month_num:02d}-{int(m.group(2)):02d}"
    m2 = re.search(r'\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b', title)
    if m2:
        return f"20{m2.group(3)}-{int(m2.group(1)):02d}-{int(m2.group(2)):02d}"
    return None


def find_meeting_id(conn, date_str):
    if not date_str:
        return None
    try:
        d = date_type.fromisoformat(date_str)
    except ValueError:
        return None
    import psycopg2
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


def transcribe_and_store(index, video_id, title, date_str, audio_path, dry_run=False, model=None):
    report_path     = RESEARCH_DIR / f"exec_{index}_{video_id}_report.json"
    transcript_path = RESEARCH_DIR / f"exec_{index}_{video_id}.txt"

    if report_path.exists():
        print(f"  SKIP (already done): {report_path.name}")
        return "skipped"

    if not audio_path.exists():
        print(f"  SKIP (no audio):     {audio_path.name}")
        return "no_audio"

    size = audio_path.stat().st_size // (1024 * 1024)
    print(f"  Audio: {audio_path.name}  ({size} MB)")

    if dry_run:
        print(f"  DRY RUN — would transcribe")
        return "dry_run"

    if model is None:
        from faster_whisper import WhisperModel
        print(f"  Loading model ({MODEL_NAME})...")
        model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
    print(f"  Transcribing...")
    segments_iter, info = model.transcribe(
        str(audio_path), beam_size=5, language="en",
        vad_filter=False, condition_on_previous_text=False,
        word_timestamps=False,
    )
    all_segments = []
    for seg in segments_iter:
        all_segments.append({
            "start": round(seg.start, 1),
            "end":   round(seg.end, 1),
            "text":  seg.text.strip(),
        })

    full_text  = " ".join(s["text"] for s in all_segments)
    word_count = len(full_text.split())
    duration   = round(info.duration, 1)

    first5          = " ".join(s["text"] for s in all_segments if s["start"] < 300)
    prayer_hits     = [kw for kw in PRAYER_KEYWORDS if kw in first5.lower()]
    prayer_detected = len(prayer_hits) >= 2

    voice_votes = []
    for seg in all_segments:
        lower   = seg["text"].lower()
        matched = [t for t in VOICE_VOTE_TRIGGERS if t in lower]
        if matched:
            idx      = all_segments.index(seg)
            ctx_segs = all_segments[max(0, idx-1) : idx+3]
            ctx_text = " ".join(s["text"] for s in ctx_segs)
            voice_votes.append({
                "time":    fmt_time(seg["start"]),
                "trigger": matched[0],
                "context": ctx_text[:300],
            })

    exec_blocks = []
    for i, seg in enumerate(all_segments):
        lower = seg["text"].lower()
        if any(t in lower for t in EXEC_SESSION_TRIGGERS):
            ctx_segs = all_segments[max(0, i-1) : i+5]
            ctx_text = " ".join(s["text"] for s in ctx_segs)
            reasons  = [r for r in EXEC_SESSION_REASONS if r in ctx_text.lower()]
            exec_blocks.append({
                "time":    fmt_time(seg["start"]),
                "context": ctx_text[:500],
                "reasons": reasons,
            })
    exec_detected    = len(exec_blocks) > 0
    all_exec_phrases = list({r for b in exec_blocks for r in b["reasons"]})

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

    with open(transcript_path, "w") as f:
        f.write(f"VIDEO:    {video_id}\n")
        f.write(f"TITLE:    {title}\n")
        f.write(f"DATE:     {date_str or 'unknown'}\n")
        f.write(f"DURATION: {fmt_time(duration)}  WORDS: {word_count}\n\n")
        f.write("=== TIMED TRANSCRIPT ===\n\n")
        for seg in all_segments:
            f.write(f"[{fmt_time(seg['start'])}]  {seg['text']}\n")

    meeting_id = None
    try:
        import psycopg2
        conn = psycopg2.connect(DB_DSN)
        meeting_id = find_meeting_id(conn, date_str)
        meeting_date_val = (date_type.fromisoformat(date_str)
                            if date_str and date_str != "unknown" else None)
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
                meeting_id, video_id, title, meeting_date_val,
                str(audio_path), full_text, first5,
                word_count, duration, f"faster-whisper/{MODEL_NAME}",
                prayer_detected, exec_detected,
                all_exec_phrases if all_exec_phrases else None,
                json.dumps(voice_votes) if voice_votes else None,
                json.dumps(exec_blocks)  if exec_blocks  else None,
                json.dumps(motions)      if motions       else None,
                json.dumps([{"t": s["start"], "text": s["text"]} for s in all_segments]),
            ))
        conn.commit()
        conn.close()
        print(f"  ✓ DB stored  meeting_id={meeting_id}")
    except Exception as e:
        print(f"  WARN DB: {e}")

    report = {
        "priority_index":        index,
        "video_id":              video_id,
        "title":                 title,
        "date":                  date_str,
        "duration":              fmt_time(duration),
        "word_count":            word_count,
        "audio_file":            str(audio_path),
        "transcript_file":       str(transcript_path),
        "prayer_detected":       prayer_detected,
        "exec_session_detected": exec_detected,
        "exec_session_count":    len(exec_blocks),
        "exec_session_times":    [b["time"] for b in exec_blocks],
        "exec_reasons_found":    all_exec_phrases,
        "voice_vote_count":      len(voice_votes),
        "voice_vote_times":      [v["time"] for v in voice_votes],
        "motion_count":          len(motions),
        "model":                 f"faster-whisper/{MODEL_NAME}",
        "meeting_id":            meeting_id,
    }
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"  Duration : {fmt_time(duration)}  Words: {word_count}")
    print(f"  Prayer   : {'YES' if prayer_detected else 'no'}")
    print(f"  ExecSess : {len(exec_blocks)}  VoiceVotes: {len(voice_votes)}  Motions: {len(motions)}")
    return "done"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only-id", default=None)
    args = parser.parse_args()

    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found: {CSV_PATH}")
        sys.exit(1)

    with open(CSV_PATH, newline="") as f:
        rows = list(csv.DictReader(f))

    # Accept priority, playlist_index, or priority_index as the index column
    def get_idx(row):
        return (row.get("priority") or row.get("playlist_index") or row.get("priority_index") or "").strip()

    total = len(rows)
    print(f"=== BCBE Exec-Priority Transcriber ===")
    print(f"  CSV entries   : {total}")
    print(f"  Audio dir     : {AUDIO_DIR}")
    if args.dry_run:
        print(f"  *** DRY RUN — no transcription ***")
    print()

    counts = {"done": 0, "skipped": 0, "no_audio": 0, "error": 0, "dry_run": 0}
    exec_sessions  = []
    voice_vote_total = 0
    motion_total   = 0

    whisper_model = None
    if not args.dry_run and not args.only_id:
        from faster_whisper import WhisperModel
        print(f"  Loading model ({MODEL_NAME}) once...")
        whisper_model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        print()

    for row in rows:
        idx   = get_idx(row)
        vid   = row.get("id", "").strip()
        title = row.get("title", "").strip()

        if not idx or not vid:
            continue
        if args.only_id and vid != args.only_id:
            continue

        # Date: prefer explicit date/meeting_date column, fall back to title parse
        date_str = (row.get("date") or row.get("meeting_date") or "").strip() or parse_date_from_title(title)
        audio_path = AUDIO_DIR / f"{idx}_{vid}.m4a"

        print(f"[{idx:>2}/{total}] {title[:60]}")
        print(f"         id={vid}  date={date_str}")

        try:
            result = transcribe_and_store(idx, vid, title, date_str, audio_path,
                                          dry_run=args.dry_run, model=whisper_model)
            counts[result] = counts.get(result, 0) + 1

            if result == "done":
                rp = RESEARCH_DIR / f"exec_{idx}_{vid}_report.json"
                if rp.exists():
                    r = json.load(open(rp))
                    if r.get("exec_session_count", 0) > 0:
                        for t in r.get("exec_session_times", []):
                            exec_sessions.append(f"  [{idx}] {t}  {title[:50]}")
                    voice_vote_total += r.get("voice_vote_count", 0)
                    motion_total     += r.get("motion_count", 0)
        except Exception as e:
            print(f"  ERROR: {e}")
            counts["error"] += 1
        print()

    print("=== Run complete ===")
    print(f"  Transcribed  : {counts.get('done', 0)}")
    print(f"  Skipped      : {counts.get('skipped', 0)}")
    print(f"  No audio     : {counts.get('no_audio', 0)}")
    print(f"  Errors       : {counts.get('error', 0)}")
    if not args.dry_run:
        print(f"\n  Exec session moments ({len(exec_sessions)}):")
        for e in exec_sessions: print(e)
        print(f"\n  Voice votes (total triggers) : {voice_vote_total}")
        print(f"  Motions/seconds (total)      : {motion_total}")


if __name__ == "__main__":
    main()
