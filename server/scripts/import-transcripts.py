#!/usr/bin/env python3
"""
Run on VPS after scp'ing the output from fetch-transcripts-local.py.

Usage:
    python3 /home/jordan/bcbe-votes/server/scripts/import-transcripts.py ~/transcripts-output.json
"""

import json
import sys
import psycopg2
from datetime import date, timedelta

DB_DSN = "postgresql:///bcbe_votes?host=/var/run/postgresql"

def find_meeting_id(conn, date_str):
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        return None
    for delta in [0, -1, 1, -2, 2]:
        candidate = d + timedelta(days=delta)
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM meetings WHERE date::date = %s ORDER BY id LIMIT 1", (candidate,))
            row = cur.fetchone()
            if row:
                return row[0]
    return None

def upsert(conn, row, meeting_id):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO meeting_prayers
                (meeting_id, video_id, video_title, meeting_date, prayer_text, word_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (video_id) DO UPDATE SET
                prayer_text  = EXCLUDED.prayer_text,
                word_count   = EXCLUDED.word_count,
                meeting_id   = EXCLUDED.meeting_id,
                extracted_at = NOW()
        """, (
            meeting_id,
            row["video_id"],
            row["title"],
            row["meeting_date"],
            row["transcript_first5min"],
            len(row["transcript_first5min"].split()) if row["transcript_first5min"] else None,
        ))
    conn.commit()

if len(sys.argv) < 2:
    print("Usage: python3 import-transcripts.py <transcripts-output.json>")
    sys.exit(1)

with open(sys.argv[1]) as f:
    rows = json.load(f)

conn = psycopg2.connect(DB_DSN)
imported = prayers = 0
for row in rows:
    meeting_id = find_meeting_id(conn, row["meeting_date"])
    upsert(conn, row, meeting_id)
    imported += 1
    if row.get("has_prayer"):
        prayers += 1
        print(f"  PRAYER  {row['meeting_date']}  {row['title'][:50]}")

conn.close()
print(f"\nImported {imported} rows, {prayers} with prayer detected.")
