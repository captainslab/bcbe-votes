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
