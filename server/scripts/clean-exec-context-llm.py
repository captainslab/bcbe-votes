#!/usr/bin/env python3
"""
Clean executive session context blocks in BCBE meeting transcripts using LLM.

Usage:
    python clean-exec-context-llm.py [--dry-run] [--video-id VIDEO_ID]
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import psycopg2
import psycopg2.extras


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_DSN = "postgresql:///bcbe_votes?host=/var/run/postgresql"
ENV_FILE = os.environ.get("BCBE_ENV_FILE", ".env")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "anthropic/claude-haiku-4-5"
RATE_LIMIT_SECONDS = 0.5

SYSTEM_PROMPT = """You are a transcript editor for Baldwin County Board of Education (BCBE) meeting recordings in Alabama. Fix Whisper speech-to-text errors in board meeting context excerpts.

Rules:
- Fix punctuation and capitalization
- Correct obvious mishearings using context (board member names: Jason Woerner, Cecil Christenberry, April Bradley, Andrea Lindsey, Ken Bradley, Rondi Kirby, Tony Myrick, Shannon Cauley; superintendent: Eddie Tyler)
- Preserve all factual content exactly — do not add, remove, or reinterpret information
- Keep the same length and structure
- Do not add commentary or explanation
- Return only the corrected text, nothing else
- Do not expose or reproduce any prayer or religious content if present"""


# ---------------------------------------------------------------------------
# Env / API key
# ---------------------------------------------------------------------------

def load_openrouter_key() -> str:
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    # Fall back to environment variable
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    print(f"ERROR: OPENROUTER_API_KEY not found in {ENV_FILE} or environment", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

def call_llm(api_key: str, raw_text: str) -> str:
    """Call the LLM to clean up a single context string. Retries once on failure."""
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
        "temperature": 0.1,
        "max_tokens": 1024,
    }).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bcbevotes.com",
        "X-Title": "BCBE Exec Session Transcript Cleaner",
    }

    def attempt():
        req = urllib.request.Request(OPENROUTER_API_URL, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"].strip()

    try:
        return attempt()
    except Exception as e:
        print(f"  WARNING: LLM call failed ({e}), retrying in 2s...")
        time.sleep(2)
        try:
            return attempt()
        except Exception as e2:
            print(f"  WARNING: Retry also failed ({e2}), skipping block.")
            return None


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_connection():
    return psycopg2.connect(DB_DSN)


def ensure_column(conn):
    with conn.cursor() as cur:
        cur.execute(
            "ALTER TABLE meeting_transcripts "
            "ADD COLUMN IF NOT EXISTS context_llm_cleaned BOOLEAN DEFAULT false;"
        )
    conn.commit()


def fetch_rows(conn, video_id=None):
    sql = """
        SELECT id, video_id, meeting_date, exec_session_context
        FROM meeting_transcripts
        WHERE exec_session_context IS NOT NULL
          AND exec_session_context::text <> 'null'
          AND jsonb_typeof(exec_session_context) = 'array'
          AND (context_llm_cleaned IS NULL OR context_llm_cleaned = false)
    """
    params = []
    if video_id:
        sql += " AND video_id = %s"
        params.append(video_id)
    sql += " ORDER BY meeting_date;"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def update_row(conn, row_id: int, cleaned_blocks: list):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE meeting_transcripts
            SET exec_session_context = %s,
                context_llm_cleaned = true,
                updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(cleaned_blocks), row_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def process_rows(rows, api_key: str, dry_run: bool):
    total_blocks = 0
    cleaned_blocks = 0

    for row in rows:
        vid = row["video_id"]
        date = row["meeting_date"]
        blocks = row["exec_session_context"]
        if isinstance(blocks, str):
            blocks = json.loads(blocks)

        # Skip rows where exec_session_context is empty after Python-level parse
        if not blocks:
            continue

        block_count = len(blocks)
        total_blocks += block_count

        if dry_run:
            print(f"[DRY-RUN] {vid} ({date}): {block_count} block(s) would be processed")
            for i, blk in enumerate(blocks):
                ctx = blk.get("context", "")
                print(f"  Block {i+1}: {ctx[:80]}{'...' if len(ctx) > 80 else ''}")
            print()
            continue

        print(f"Processing {vid} ({date}): {block_count} block(s)")
        updated_blocks = []

        for i, blk in enumerate(blocks):
            raw_ctx = blk.get("context", "")
            if not raw_ctx.strip():
                updated_blocks.append(blk)
                continue

            print(f"  Block {i+1}/{block_count}:")
            print(f"    BEFORE: {raw_ctx}")

            cleaned = call_llm(api_key, raw_ctx)
            time.sleep(RATE_LIMIT_SECONDS)

            if cleaned is None:
                print(f"    SKIPPED (LLM error)")
                updated_blocks.append(blk)
                continue

            print(f"    AFTER:  {cleaned}")

            new_blk = dict(blk)
            new_blk["context"] = cleaned
            updated_blocks.append(new_blk)
            cleaned_blocks += 1

        # Persist
        conn = None
        try:
            conn = get_connection()
            update_row(conn, row["id"], updated_blocks)
            print(f"  Saved to DB.\n")
        except Exception as e:
            print(f"  ERROR saving to DB: {e}\n", file=sys.stderr)
        finally:
            if conn:
                conn.close()

    if dry_run:
        print(f"[DRY-RUN] Would process {total_blocks} blocks across {len(rows)} rows.")
    else:
        print(f"Done. Cleaned {cleaned_blocks}/{total_blocks} blocks across {len(rows)} row(s).")

    return cleaned_blocks, total_blocks


def main():
    parser = argparse.ArgumentParser(description="LLM cleanup for exec session context blocks")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be processed, no API calls")
    parser.add_argument("--video-id", metavar="VIDEO_ID", help="Process only this video_id")
    args = parser.parse_args()

    api_key = load_openrouter_key()

    conn = get_connection()
    try:
        ensure_column(conn)
        rows = fetch_rows(conn, video_id=args.video_id)
    finally:
        conn.close()

    if not rows:
        print("No rows to process (either all cleaned already or no exec_session_context data).")
        return

    print(f"Found {len(rows)} row(s) to process.\n")
    process_rows(rows, api_key=api_key, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
