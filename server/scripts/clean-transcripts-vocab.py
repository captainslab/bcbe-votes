#!/usr/bin/env python3
"""
Vocabulary correction script for BCBE meeting transcripts.

Applies known Whisper mis-transcription fixes to:
  - transcript_text (full text string)
  - timed_segments JSONB (each segment's "text" field)
  - exec_session_context JSONB (each block's "context" field)
  - voice_votes JSONB (each block's "context" field)
  - motions_detected JSONB (each block's "context" field)

Usage:
  python3 clean-transcripts-vocab.py               # apply all fixes
  python3 clean-transcripts-vocab.py --dry-run     # print plan, no writes
  python3 clean-transcripts-vocab.py --video-id VIDEO_ID
  python3 clean-transcripts-vocab.py --dry-run --video-id VIDEO_ID
"""

import argparse
import json
import re
import sys
from collections import defaultdict

import psycopg2

DSN = "postgresql:///bcbe_votes?host=/var/run/postgresql"

# ---------------------------------------------------------------------------
# Correction rules — applied in order to avoid double-replacement.
# Each entry: (regex_pattern, replacement_string, human_label)
# ---------------------------------------------------------------------------
CORRECTIONS = [
    # Board member names — most-specific patterns first
    (r"\bChris and Barry\b",   "Christenberry",  "Chris and Barry → Christenberry"),
    (r"\bMr\. Warner\b",       "Mr. Woerner",    "Mr. Warner → Mr. Woerner"),
    (r"\bMrs\. Warner\b",      "Mrs. Woerner",   "Mrs. Warner → Mrs. Woerner"),
    (r"\bMr\. Werner\b",       "Mr. Woerner",    "Mr. Werner → Mr. Woerner"),
    (r"\bMrs\. Werner\b",      "Mrs. Woerner",   "Mrs. Werner → Mrs. Woerner"),
    # Standalone Warner / Werner after title-prefixed patterns are already consumed
    (r"\bWarner\b",            "Woerner",        "Warner → Woerner"),
    (r"\bWerner\b",            "Woerner",        "Werner → Woerner"),
    # Rhonda / Ronda → Rondi
    (r"\bRhonda\b",            "Rondi",          "Rhonda → Rondi"),
    (r"\bRonda\b",             "Rondi",          "Ronda → Rondi"),
    # Andrew → Andrea (not Andrews / Andrew's)
    (r"\bAndrew\b(?!s|')",     "Andrea",         "Andrew → Andrea"),
    # Public commenter names
    (r"\bCuspecki\b",          "Scapecchi",      "Cuspecki → Scapecchi"),
    (r"\bCupecki\b",           "Scapecchi",      "Cupecki → Scapecchi"),
    # Capitalization fixes
    (r"\bmr\. Tyler\b",        "Mr. Tyler",      "mr. Tyler → Mr. Tyler"),
    (r"\bms\. Tyler\b",        "Ms. Tyler",      "ms. Tyler → Ms. Tyler"),
    (r"\bbaldwin county\b",    "Baldwin County", "baldwin county → Baldwin County"),
]

# Pre-compile all patterns for efficiency
_COMPILED = [(re.compile(pat), repl, label) for pat, repl, label in CORRECTIONS]


def apply_corrections(text: str, counts: dict) -> str:
    """Apply all CORRECTIONS to text, accumulating hit counts."""
    if not text:
        return text
    for pattern, replacement, label in _COMPILED:
        new_text, n = pattern.subn(replacement, text)
        if n:
            counts[label] += n
            text = new_text
    return text


def fix_voice_vote_i(segments: list, counts: dict) -> list:
    """
    Replace standalone "I" / " I" / "I." with "Aye" when the immediately
    preceding segment text contains "all in favor" or "say aye" (case-insensitive).
    """
    if not segments:
        return segments
    result = []
    for idx, seg in enumerate(segments):
        seg_text = seg.get("text", "")
        stripped = seg_text.strip().rstrip(".")
        if stripped in ("I",) and idx > 0:
            prev_text = segments[idx - 1].get("text", "").lower()
            if "all in favor" in prev_text or "say aye" in prev_text:
                seg = dict(seg)  # don't mutate the original
                seg["text"] = "Aye"
                counts["voice-vote I → Aye"] += 1
        result.append(seg)
    return result


def process_jsonb_list(data, field: str, counts: dict):
    """
    Walk a JSONB list-of-objects and apply corrections to each object's
    named field.  Returns the (possibly modified) list.
    """
    if not isinstance(data, list):
        return data
    result = []
    for item in data:
        if isinstance(item, dict) and field in item:
            fixed = apply_corrections(item[field], counts)
            if fixed != item[field]:
                item = dict(item)
                item[field] = fixed
        result.append(item)
    return result


def process_row(video_id: str, row: dict, dry_run: bool, cur) -> dict:
    """
    Process one transcript row.  Returns a summary dict with per-label counts.
    """
    counts = defaultdict(int)

    transcript_text = row["transcript_text"] or ""
    timed_segments  = row["timed_segments"]  or []
    exec_ctx        = row["exec_session_context"]
    voice_votes     = row["voice_votes"]
    motions         = row["motions_detected"]

    # --- transcript_text ---
    new_transcript = apply_corrections(transcript_text, counts)

    # --- timed_segments ---
    new_segs = [dict(s) for s in timed_segments]  # shallow copy list
    for seg in new_segs:
        if "text" in seg:
            seg["text"] = apply_corrections(seg["text"], counts)
    # voice-vote "I" → "Aye"
    new_segs = fix_voice_vote_i(new_segs, counts)

    # --- exec_session_context ---
    new_exec = exec_ctx
    if isinstance(exec_ctx, list):
        new_exec = process_jsonb_list(
            [dict(b) for b in exec_ctx], "context", counts
        )
    elif isinstance(exec_ctx, dict) and "context" in exec_ctx:
        fixed = apply_corrections(exec_ctx["context"], counts)
        if fixed != exec_ctx["context"]:
            new_exec = dict(exec_ctx)
            new_exec["context"] = fixed

    # --- voice_votes ---
    new_vv = voice_votes
    if isinstance(voice_votes, list):
        new_vv = process_jsonb_list(
            [dict(b) for b in voice_votes], "context", counts
        )

    # --- motions_detected ---
    new_motions = motions
    if isinstance(motions, list):
        new_motions = process_jsonb_list(
            [dict(b) for b in motions], "context", counts
        )

    total = sum(counts.values())

    if total == 0:
        return dict(counts)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}video_id={video_id}: {total} replacement(s)")
    for label, n in sorted(counts.items()):
        print(f"    {n:4d}  {label}")

    if not dry_run:
        cur.execute(
            """
            UPDATE meeting_transcripts
            SET
                transcript_text      = %s,
                timed_segments       = %s::jsonb,
                exec_session_context = %s::jsonb,
                voice_votes          = %s::jsonb,
                motions_detected     = %s::jsonb
            WHERE video_id = %s
            """,
            (
                new_transcript,
                json.dumps(new_segs),
                json.dumps(new_exec),
                json.dumps(new_vv),
                json.dumps(new_motions),
                video_id,
            ),
        )

    return dict(counts)


def main():
    parser = argparse.ArgumentParser(
        description="Apply vocabulary corrections to BCBE meeting transcripts."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change but do not write to the database.",
    )
    parser.add_argument(
        "--video-id",
        metavar="VIDEO_ID",
        help="Target a single transcript by video_id.",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        if args.video_id:
            cur.execute(
                """
                SELECT video_id, transcript_text, timed_segments,
                       exec_session_context, voice_votes, motions_detected
                FROM meeting_transcripts
                WHERE video_id = %s
                """,
                (args.video_id,),
            )
        else:
            cur.execute(
                """
                SELECT video_id, transcript_text, timed_segments,
                       exec_session_context, voice_votes, motions_detected
                FROM meeting_transcripts
                ORDER BY video_id
                """
            )

        rows = cur.fetchall()
        columns = ["video_id", "transcript_text", "timed_segments",
                   "exec_session_context", "voice_votes", "motions_detected"]

        if not rows:
            print("No rows found.")
            return

        print(f"{'[DRY RUN] ' if args.dry_run else ''}Processing {len(rows)} transcript(s)...\n")

        global_counts = defaultdict(int)
        updated_count = 0

        for row_tuple in rows:
            row = dict(zip(columns, row_tuple))
            video_id = row["video_id"]
            counts = process_row(video_id, row, args.dry_run, cur)
            if sum(counts.values()) > 0:
                updated_count += 1
                for label, n in counts.items():
                    global_counts[label] += n

        print("\n" + "=" * 60)
        print(f"{'[DRY RUN] ' if args.dry_run else ''}SUMMARY")
        print("=" * 60)
        print(f"  Transcripts scanned : {len(rows)}")
        print(f"  Transcripts {'to update' if args.dry_run else 'updated'}  : {updated_count}")
        print(f"  Total replacements  : {sum(global_counts.values())}")
        if global_counts:
            print("\n  Breakdown by correction type:")
            for label, n in sorted(global_counts.items(), key=lambda x: -x[1]):
                print(f"    {n:5d}  {label}")

        if not args.dry_run:
            conn.commit()
            print("\nChanges committed to database.")
        else:
            conn.rollback()
            print("\nDry run complete — no changes written.")

    except Exception as exc:
        conn.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
