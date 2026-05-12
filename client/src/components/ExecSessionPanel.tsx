import type { TranscriptData } from "../types";

type ExecSessionEntry = {
  time: string;
  context: string;
  reasons: string[];
};

type Props = {
  transcript: TranscriptData | null | undefined;
};

/** Convert a HH:MM:SS or MM:SS timestamp string to total seconds */
function parseTimestamp(time: string): number | null {
  const parts = time.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

const REASON_COLORS: Record<string, string> = {
  "real estate": "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20",
  "pending litigation": "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  "litigation": "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  "personnel": "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
  "employment": "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
  "security": "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  "negotiations": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  "collective bargaining": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
};

function reasonColor(reason: string): string {
  const key = reason.toLowerCase();
  for (const [k, cls] of Object.entries(REASON_COLORS)) {
    if (key.includes(k)) return cls;
  }
  return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
}

function ExecSessionEntry({
  entry,
  videoId,
  index,
}: {
  entry: ExecSessionEntry;
  videoId: string | undefined;
  index: number;
}) {
  const seconds = parseTimestamp(entry.time);
  const timestampHref =
    videoId && seconds !== null
      ? `https://youtube.com/watch?v=${videoId}&t=${seconds}`
      : null;

  return (
    <div
      className={`relative rounded-lg border border-slate-200 bg-white p-4 ${
        index > 0 ? "mt-3" : ""
      }`}
    >
      {/* Accent bar */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-slate-700" />

      <div className="pl-3">
        {/* Header row: timestamp + index */}
        <div className="flex flex-wrap items-center gap-2">
          {timestampHref ? (
            <a
              href={timestampHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              title="Watch on YouTube at this timestamp"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-2.75 12.23 12.23 0 0 0-16.11 6.2A12.19 12.19 0 0 0 3.5 21.19a12.22 12.22 0 0 0 15.55-2.19 4.85 4.85 0 0 1 3.78-2.74A12.24 12.24 0 0 0 19.59 6.69Zm-7.57 10.7a6.93 6.93 0 1 1 6.93-6.93 6.93 6.93 0 0 1-6.93 6.93Z" />
              </svg>
              {entry.time}
            </a>
          ) : (
            <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-white">
              {entry.time}
            </span>
          )}
          <span className="text-xs text-slate-400">Session {index + 1}</span>
        </div>

        {/* Context */}
        <p className="mt-2 text-sm leading-6 text-slate-700 italic">
          &ldquo;{entry.context}&rdquo;
        </p>

        {/* Reasons */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.reasons.length > 0 ? (
            entry.reasons.map((r) => (
              <span
                key={r}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${reasonColor(r)}`}
              >
                {r}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400 italic">Reason not stated</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExecSessionPanel({ transcript }: Props) {
  if (!transcript || !transcript.execSessionDetected) return null;

  const sessions = transcript.execSessionContext ?? [];
  const count = sessions.length;

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <span className="text-xl" role="img" aria-label="locked">
          🔒
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Executive Session</h2>
          <p className="text-sm text-slate-500">
            {count === 0
              ? "Closed session detected — no timestamped entries captured"
              : count === 1
                ? "Board entered closed session 1 time"
                : `Board entered closed session ${count} times`}
          </p>
        </div>
        {transcript.videoId && (
          <a
            href={`https://youtube.com/watch?v=${transcript.videoId}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-semibold text-slate-600 underline hover:text-slate-900"
          >
            Watch full meeting
          </a>
        )}
      </div>

      {/* Session entries */}
      {sessions.length > 0 && (
        <div className="px-5 py-4">
          {sessions.map((entry, i) => (
            <ExecSessionEntry
              key={`${entry.time}-${i}`}
              entry={entry}
              videoId={transcript.videoId}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-slate-200 bg-white px-5 py-3">
        <p className="text-xs text-slate-400">
          Detected from meeting video transcript.{" "}
          {transcript.videoTitle && (
            <span>Source: &ldquo;{transcript.videoTitle}&rdquo;</span>
          )}
        </p>
      </div>
    </div>
  );
}
