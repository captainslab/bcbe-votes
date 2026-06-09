#!/usr/bin/env python3
"""
Extract opening prayers/invocations from BCBE board meeting YouTube videos.
Uses yt-dlp subtitle extraction (bypasses server IP blocks on youtube-transcript-api).
Parses the first 4 minutes of VTT captions for prayer content.
"""

import sys
import json
import time
import re
import subprocess
import os
import glob
import urllib.request
import psycopg2
from datetime import date, timedelta

# ── Config ───────────────────────────────────────────────────────────────────

KEY     = "AIzaSyC2nEkZIjNoh6HmoeMqFQAfaiUbR1J-16I"
CHANNEL = "UC-DmwEwt2RlqCqe92LCSftQ"
DB_DSN  = "postgresql:///bcbe_votes?host=/var/run/postgresql"
TMP_DIR = "/tmp/bcbe_prayers"

# Filter terms for non-meeting videos (case-insensitive)
SKIP_TERMS = [
    "test", "av test", "baldwin prep", "bcvs virtual", "girls can build",
    "pre-k lottery", "career. college", "what is a day", "budget hearing",
]

# Prayer detection keywords
PRAYER_KEYWORDS = [
    "pray", "prayer", "lord", "god", "father", "heavenly", "bless", "amen",
    "invocation", "almighty", "jesus", "christ", "holy spirit",
    "guidance", "wisdom", "grace", "mercy", "protect", "faithful",
    "scripture", "bible", "thy", "thou", "thee", "unto",
]

# Speaker extraction patterns
SPEAKER_PATTERNS = [
    r"\b(Pastor\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Reverend\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Rev\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Brother\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Sister\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Father\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Deacon\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Minister\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Chaplain\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"\b(Dr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"(?:invocation|prayer)\s+(?:by|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"(?:by|from)\s+((?:Pastor|Reverend|Brother|Sister)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    r"(?:I am|I'm|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_videos():
    """Fetch all video IDs from the channel via YouTube Data API v3."""
    videos = []
    seen_ids = set()
    page_token = ""
    while True:
        url = (
            f"https://www.googleapis.com/youtube/v3/search"
            f"?part=snippet&channelId={CHANNEL}&maxResults=50&order=date&type=video&key={KEY}"
        )
        if page_token:
            url += f"&pageToken={page_token}"
        try:
            res = json.loads(urllib.request.urlopen(url, timeout=15).read())
        except Exception as e:
            print(f"  [WARN] YouTube API error: {e}")
            break
        for item in res.get("items", []):
            vid = item["id"]["videoId"]
            if vid in seen_ids:
                continue
            seen_ids.add(vid)
            videos.append({
                "videoId":     vid,
                "title":       item["snippet"]["title"],
                "publishedAt": item["snippet"]["publishedAt"][:10],
            })
        page_token = res.get("nextPageToken", "")
        if not page_token:
            break
        time.sleep(0.2)
    return videos


def is_real_meeting(video):
    title_lower = video["title"].lower()
    return not any(term in title_lower for term in SKIP_TERMS)


def parse_vtt(vtt_path, max_seconds=240):
    """Extract deduplicated text from VTT file within first max_seconds."""
    try:
        with open(vtt_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return ""

    text_lines = []
    seen = set()

    blocks = re.split(r'\n\n+', content)
    for block in blocks:
        lines = block.strip().split('\n')
        if not lines:
            continue

        # Find timestamp line
        ts_line = None
        for line in lines:
            if '-->' in line:
                ts_line = line
                break
        if not ts_line:
            continue

        # Parse start time — handles HH:MM:SS.mmm and MM:SS.mmm
        m = re.match(r'(\d+):(\d+):(\d+)[\.,]\d+', ts_line)
        if m:
            start_sec = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        else:
            m = re.match(r'(\d+):(\d+)[\.,]\d+', ts_line)
            if m:
                start_sec = int(m.group(1)) * 60 + int(m.group(2))
            else:
                continue

        if start_sec > max_seconds:
            continue

        # Collect text
        for line in lines:
            if '-->' in line:
                continue
            if re.match(r'^\d+$', line.strip()):
                continue
            if line.strip() in ('WEBVTT', '') or line.strip().startswith(('Kind:', 'Language:', 'NOTE')):
                continue
            # Strip VTT inline tags: <00:00:01.234>, <c>, </c>, <b>, etc.
            clean = re.sub(r'<[^>]+>', '', line).strip()
            if clean and clean not in seen:
                seen.add(clean)
                text_lines.append(clean)

    return ' '.join(text_lines)


def download_vtt(video_id):
    """Run yt-dlp to download auto-captions for a video. Returns path to .vtt file or None."""
    # Clean up any leftover files first
    for f in glob.glob(f"{TMP_DIR}/prayer_{video_id}*"):
        os.remove(f)

    cmd = [
        "yt-dlp",
        "--write-auto-sub",
        "--sub-lang", "en",
        "--sub-format", "vtt",
        "--skip-download",
        "--no-warnings",
        "--quiet",
        "--output", f"{TMP_DIR}/prayer_{video_id}.%(ext)s",
        f"https://www.youtube.com/watch?v={video_id}"
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    except subprocess.TimeoutExpired:
        print(f"         → yt-dlp timed out")
        return None

    if result.returncode != 0 and "no subtitles" not in result.stderr.lower():
        stderr_snippet = result.stderr[:200] if result.stderr else "(no stderr)"
        print(f"         → yt-dlp error: {stderr_snippet}")

    vtt_files = glob.glob(f"{TMP_DIR}/prayer_{video_id}*.vtt")
    return vtt_files[0] if vtt_files else None


def is_prayer_content(text):
    if not text:
        return False
    lower = text.lower()
    hits = sum(1 for kw in PRAYER_KEYWORDS if kw in lower)
    return hits >= 2


def extract_speaker(text):
    if not text:
        return None
    snippet = text[:500]
    for pattern in SPEAKER_PATTERNS:
        m = re.search(pattern, snippet)
        if m:
            return m.group(1).strip()[:60]
    return None


def find_meeting_id(conn, pub_date_str):
    try:
        pub = date.fromisoformat(pub_date_str)
    except ValueError:
        return None
    candidates = [pub - timedelta(days=1), pub, pub - timedelta(days=2), pub + timedelta(days=1)]
    with conn.cursor() as cur:
        for candidate in candidates:
            cur.execute(
                "SELECT id FROM meetings WHERE date::date = %s ORDER BY id LIMIT 1",
                (candidate,)
            )
            row = cur.fetchone()
            if row:
                return row[0]
    return None


def already_stored(conn, video_id):
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM meeting_prayers WHERE video_id = %s", (video_id,))
        return cur.fetchone() is not None


def insert_prayer(conn, video_id, video_title, meeting_date, meeting_id,
                  prayer_text, speaker_name, word_count):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO meeting_prayers
                (meeting_id, video_id, video_title, meeting_date, prayer_text,
                 speaker_name, word_count)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (video_id) DO UPDATE SET
                prayer_text  = EXCLUDED.prayer_text,
                speaker_name = EXCLUDED.speaker_name,
                word_count   = EXCLUDED.word_count,
                extracted_at = NOW()
        """, (meeting_id, video_id, video_title, meeting_date,
              prayer_text, speaker_name, word_count))
    conn.commit()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(TMP_DIR, exist_ok=True)
    print("=== BCBE Prayer Extractor (yt-dlp mode) ===\n")

    try:
        conn = psycopg2.connect(DB_DSN)
    except Exception as e:
        print(f"ERROR: Cannot connect to database: {e}")
        sys.exit(1)

    print("Fetching video list from YouTube...")
    all_videos = fetch_videos()
    real_videos = [v for v in all_videos if is_real_meeting(v)]
    print(f"  Total videos: {len(all_videos)}, real meetings: {len(real_videos)}\n")

    stats = {
        "skipped":    0,
        "no_vtt":     0,
        "no_prayer":  0,
        "extracted":  0,
        "errors":     0,
    }
    no_vtt_videos = []

    for i, video in enumerate(real_videos):
        vid   = video["videoId"]
        title = video["title"]
        pub   = video["publishedAt"]

        print(f"[{i+1:3d}/{len(real_videos)}] {title} ({vid}, {pub})")

        if already_stored(conn, vid):
            print(f"         → already stored, skipping")
            stats["skipped"] += 1
            continue

        vtt_path = download_vtt(vid)

        if not vtt_path:
            print(f"         → no captions available")
            stats["no_vtt"] += 1
            no_vtt_videos.append({"videoId": vid, "title": title, "publishedAt": pub})
            meeting_id = find_meeting_id(conn, pub)
            try:
                insert_prayer(conn, vid, title, pub, meeting_id, None, None, None)
            except Exception as e:
                conn.rollback()
                print(f"         → DB error storing null row: {e}")
            time.sleep(1)
            continue

        # Parse VTT — first 4 minutes
        text = parse_vtt(vtt_path, max_seconds=240)

        # Clean up tmp file
        for f in glob.glob(f"{TMP_DIR}/prayer_{vid}*"):
            try:
                os.remove(f)
            except Exception:
                pass

        if not text or not is_prayer_content(text):
            print(f"         → {'empty transcript' if not text else 'transcript found but no prayer content'}")
            stats["no_prayer"] += 1
            meeting_id = find_meeting_id(conn, pub)
            try:
                # Store the raw text even if not detected as prayer — useful for manual review
                insert_prayer(conn, vid, title, pub, meeting_id,
                              text if text else None, None,
                              len(text.split()) if text else None)
            except Exception as e:
                conn.rollback()
                print(f"         → DB error: {e}")
            time.sleep(1)
            continue

        word_count   = len(text.split())
        speaker_name = extract_speaker(text)
        meeting_id   = find_meeting_id(conn, pub)
        preview      = text[:100].replace("\n", " ")

        print(f"         → prayer extracted ({word_count} words), speaker: {speaker_name or 'unknown'}")
        print(f"         → preview: {preview}…")
        if meeting_id:
            print(f"         → matched meeting_id={meeting_id}")
        else:
            print(f"         → no DB meeting match for {pub}")

        try:
            insert_prayer(conn, vid, title, pub, meeting_id, text, speaker_name, word_count)
            stats["extracted"] += 1
        except Exception as e:
            conn.rollback()
            print(f"         → DB error: {e}")
            stats["errors"] += 1

        time.sleep(1)

    conn.close()

    print("\n=== Summary ===")
    print(f"  Prayers extracted & stored : {stats['extracted']}")
    print(f"  Already in DB (skipped)    : {stats['skipped']}")
    print(f"  No captions available      : {stats['no_vtt']}")
    print(f"  Captions but no prayer     : {stats['no_prayer']}")
    print(f"  DB errors                  : {stats['errors']}")

    if no_vtt_videos:
        print(f"\nVideos with no captions ({len(no_vtt_videos)}):")
        for v in no_vtt_videos:
            print(f"  {v['publishedAt']}  {v['title']}")


if __name__ == "__main__":
    main()
