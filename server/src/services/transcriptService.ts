import { sql } from "drizzle-orm";
import { db } from "../db";

export type TranscriptSummary = {
  videoId: string;
  videoTitle: string;
  meetingDate: string | null;
  wordCount: number | null;
  durationSeconds: number | null;
  execSessionDetected: boolean;
  execSessionContext: Array<{ time: string; context: string; reasons: string[] }> | null;
  voiceVotes: Array<{ time: string; trigger: string; context: string }> | null;
  motionsDetected: Array<{ time: string; kind: string; context: string }> | null;
  updatedAt: string;
};

export type TranscriptSearchMatch = {
  time: string;
  context: string;
  timestampUrl: string;
};

export type TranscriptSearchResult = {
  meetingId: number | null;
  videoId: string;
  videoTitle: string;
  date: string | null;
  totalMatches: number;
  matches: TranscriptSearchMatch[];
};

export type TranscriptListItem = {
  meetingId: number | null;
  videoId: string;
  videoTitle: string;
  date: string | null;
  wordCount: number | null;
  durationSeconds: number | null;
  execSessionDetected: boolean;
};

export type TranscriptMentionCountQuery = {
  keyword: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type TranscriptMentionMeeting = {
  meetingId: number | null;
  videoId: string;
  title: string;
  date: string | null;
  mentionCount: number;
};

export type TranscriptMentionCountResult = {
  keyword: string;
  startDate: string;
  endDate: string;
  dateRangeLabel: string;
  totalMentions: number;
  matchedRecordCount: number;
  meetings: TranscriptMentionMeeting[];
};

function secondsToTs(n: number): string {
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countKeywordMentions = (text: string, keyword: string) => {
  const term = keyword.trim();
  if (!term) return 0;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(term)}(?=$|[^A-Za-z0-9_])`, "gi");
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  return count;
};

export const countTranscriptMentions = async ({
  keyword,
  startDate = "1900-01-01",
  endDate,
}: TranscriptMentionCountQuery): Promise<TranscriptMentionCountResult> => {
  const term = keyword.trim();
  if (term.length < 2) {
    return {
      keyword: term,
      startDate: startDate ?? "1900-01-01",
      endDate: endDate ?? new Date().toISOString().slice(0, 10),
      dateRangeLabel: `${startDate ?? "1900-01-01"} through ${endDate ?? new Date().toISOString().slice(0, 10)}`,
      totalMentions: 0,
      matchedRecordCount: 0,
      meetings: [],
    };
  }

  type RawMentionRow = {
    meeting_id: number | null;
    video_id: string;
    video_title: string;
    meeting_date: Date | string | null;
    transcript_text: string | null;
  };

  const endDateResult = await db.execute(
    sql`SELECT COALESCE(${endDate ?? null}::date, (SELECT COALESCE(MAX(meeting_date), CURRENT_DATE)::date FROM meeting_transcripts)) AS end_date`,
  );
  const effectiveEndDate = toDateString((endDateResult.rows[0] as { end_date?: Date | string | null } | undefined)?.end_date ?? null)
    ?? new Date().toISOString().slice(0, 10);

  const result = await db.execute(
    sql`
      SELECT
        meeting_id,
        video_id,
        video_title,
        meeting_date,
        transcript_text
      FROM meeting_transcripts
      WHERE transcript_text ILIKE ${`%${term}%`}
        AND meeting_date >= ${startDate}::date
        AND meeting_date < (${effectiveEndDate}::date + INTERVAL '1 day')
      ORDER BY meeting_date DESC NULLS LAST
    `,
  );

  const rows = result.rows as RawMentionRow[];
  const meetings = rows
    .map((row) => ({
      meetingId: row.meeting_id ?? null,
      videoId: row.video_id,
      title: row.video_title,
      date: toDateString(row.meeting_date),
      mentionCount: countKeywordMentions(row.transcript_text ?? "", term),
    }))
    .filter((row) => row.mentionCount > 0);

  const totalMentions = meetings.reduce((sum, row) => sum + row.mentionCount, 0);
  const normalizedStart = startDate ?? "1900-01-01";

  return {
    keyword: term,
    startDate: normalizedStart,
    endDate: effectiveEndDate,
    dateRangeLabel: `${normalizedStart} through ${effectiveEndDate}`,
    totalMentions,
    matchedRecordCount: meetings.length,
    meetings,
  };
};

export const searchTranscripts = async (
  query: string,
  boardId?: number | null,
): Promise<TranscriptSearchResult[]> => {
  if (!query || query.trim().length < 2) return [];

  type RawSearchRow = {
    meeting_id: number | null;
    video_id: string;
    video_title: string;
    meeting_date: Date | string | null;
    timed_segments: unknown;
  };

  const result = await db.execute(
    boardId != null
      ? sql`
          SELECT
            mt.meeting_id,
            mt.video_id,
            mt.video_title,
            mt.meeting_date,
            mt.timed_segments
          FROM meeting_transcripts mt
          JOIN meetings m ON m.id = mt.meeting_id
          WHERE m.board_id = ${boardId}
            AND to_tsvector('english', mt.transcript_text) @@ plainto_tsquery('english', ${query})
          ORDER BY mt.meeting_date DESC NULLS LAST
        `
      : sql`
          SELECT
            meeting_id,
            video_id,
            video_title,
            meeting_date,
            timed_segments
          FROM meeting_transcripts
          WHERE to_tsvector('english', transcript_text) @@ plainto_tsquery('english', ${query})
          ORDER BY meeting_date DESC NULLS LAST
        `,
  );

  const queryWords = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  return (result.rows as RawSearchRow[]).map((row) => {
    const segments = Array.isArray(row.timed_segments)
      ? (row.timed_segments as Array<{ t: number; text: string }>)
      : [];

    const matchingSegments = segments
      .filter((seg) => {
        const lower = seg.text.toLowerCase();
        return queryWords.some((word) => lower.includes(word));
      })
      .slice(0, 5);

    const matches: TranscriptSearchMatch[] = matchingSegments.map((seg) => {
      const secs = Math.floor(seg.t);
      const timeLabel = secondsToTs(secs);
      const context = seg.text.length > 200 ? seg.text.slice(0, 200).trimEnd() + "…" : seg.text;
      const timestampUrl = `https://youtube.com/watch?v=${row.video_id}&t=${secs}`;
      return { time: timeLabel, context, timestampUrl };
    });

    return {
      meetingId: row.meeting_id ?? null,
      videoId: row.video_id,
      videoTitle: row.video_title,
      date: toDateString(row.meeting_date),
      totalMatches: matchingSegments.length,
      matches,
    };
  });
};

export const listTranscripts = async (
  boardId?: number | null,
): Promise<TranscriptListItem[]> => {
  type RawListRow = {
    meeting_id: number | null;
    video_id: string;
    video_title: string;
    meeting_date: Date | string | null;
    word_count: number | null;
    duration_seconds: number | null;
    exec_session_detected: boolean;
  };

  const result = await db.execute(
    boardId != null
      ? sql`
          SELECT
            mt.meeting_id,
            mt.video_id,
            mt.video_title,
            mt.meeting_date,
            mt.word_count,
            mt.duration_seconds,
            mt.exec_session_detected
          FROM meeting_transcripts mt
          JOIN meetings m ON m.id = mt.meeting_id
          WHERE m.board_id = ${boardId}
          ORDER BY mt.meeting_date DESC NULLS LAST
        `
      : sql`
          SELECT
            meeting_id,
            video_id,
            video_title,
            meeting_date,
            word_count,
            duration_seconds,
            exec_session_detected
          FROM meeting_transcripts
          ORDER BY meeting_date DESC NULLS LAST
        `,
  );

  return (result.rows as RawListRow[]).map((row) => ({
    meetingId: row.meeting_id ?? null,
    videoId: row.video_id,
    videoTitle: row.video_title,
    date: toDateString(row.meeting_date),
    wordCount: row.word_count ?? null,
    durationSeconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    execSessionDetected: Boolean(row.exec_session_detected),
  }));
};

type RawTranscriptRow = {
  video_id: string;
  video_title: string;
  meeting_date: Date | string | null;
  word_count: number | null;
  duration_seconds: number | null;
  exec_session_detected: boolean;
  exec_session_context: unknown;
  voice_votes: unknown;
  motions_detected: unknown;
  updated_at: Date | string;
};

export const getTranscriptForMeeting = async (
  meetingId: number,
): Promise<TranscriptSummary | null> => {
  const result = await db.execute(
    sql`
      SELECT
        video_id,
        video_title,
        meeting_date,
        word_count,
        duration_seconds,
        exec_session_detected,
        exec_session_context,
        voice_votes,
        motions_detected,
        updated_at
      FROM meeting_transcripts
      WHERE meeting_id = ${meetingId}
      LIMIT 1
    `,
  );

  const row = result.rows[0] as RawTranscriptRow | undefined;
  if (!row) return null;

  const toDateString = (value: Date | string | null): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };

  const toISOString = (value: Date | string): string => {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };

  return {
    videoId: row.video_id,
    videoTitle: row.video_title,
    meetingDate: toDateString(row.meeting_date),
    wordCount: row.word_count ?? null,
    durationSeconds: row.duration_seconds ?? null,
    execSessionDetected: Boolean(row.exec_session_detected),
    execSessionContext: Array.isArray(row.exec_session_context)
      ? (row.exec_session_context as Array<{ time: string; context: string; reasons: string[] }>)
      : null,
    voiceVotes: Array.isArray(row.voice_votes)
      ? (row.voice_votes as Array<{ time: string; trigger: string; context: string }>)
      : null,
    motionsDetected: Array.isArray(row.motions_detected)
      ? (row.motions_detected as Array<{ time: string; kind: string; context: string }>)
      : null,
    updatedAt: toISOString(row.updated_at),
  };
};
