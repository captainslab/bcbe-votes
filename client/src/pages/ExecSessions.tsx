import { useState } from "react";
import { Link } from "react-router-dom";
import { useExecSessionDetail } from "../api/hooks";
import type { ExecSessionBlock, ExecSessionDetailRow } from "../types";

const REASON_LABELS: Record<string, string> = {
  "real estate": "Real estate",
  "pending litigation": "Pending litigation",
  "potential litigation": "Potential litigation",
  "possible litigation": "Possible litigation",
  "good name and character": "Good name & character",
  character: "Good name & character",
  "personnel matter": "Personnel",
  employment: "Employment",
  "legal counsel": "Legal counsel",
};

const REASON_COLORS: Record<string, string> = {
  "real estate": "bg-orange-50 text-orange-700 ring-orange-600/20",
  litigation: "bg-rose-50 text-rose-700 ring-rose-600/20",
  character: "bg-violet-50 text-violet-700 ring-violet-600/20",
  personnel: "bg-violet-50 text-violet-700 ring-violet-600/20",
  employment: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

function reasonColor(reason: string): string {
  const lower = reason.toLowerCase();
  for (const [k, cls] of Object.entries(REASON_COLORS)) {
    if (lower.includes(k)) return `ring-1 ring-inset ${cls}`;
  }
  return "ring-1 ring-inset bg-slate-100 text-slate-600 ring-slate-200";
}

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason.toLowerCase()] ?? reason;
}

function dedupeBlocks(blocks: ExecSessionBlock[]): ExecSessionBlock[] {
  // Some meetings have multiple overlapping context segments for the same moment.
  // Keep the block with the best data (has reasons > has actors > longest context).
  const seen = new Map<string, ExecSessionBlock>();
  for (const b of blocks) {
    const minuteKey = b.time.split(":").slice(0, -1).join(":");
    const existing = seen.get(minuteKey);
    if (!existing) { seen.set(minuteKey, b); continue; }
    const score = (bl: ExecSessionBlock) =>
      (bl.reasons.length > 0 ? 2 : 0) +
      (bl.movedBy ? 1 : 0) +
      (bl.secondedBy ? 1 : 0);
    if (score(b) > score(existing)) seen.set(minuteKey, b);
  }
  return Array.from(seen.values());
}

function BlockRow({ block }: { block: ExecSessionBlock }) {
  const [open, setOpen] = useState(false);
  const hasReasons = block.reasons.length > 0;
  const hasActors = block.movedBy || block.secondedBy;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 pl-4 pr-3 align-top">
        {block.timestampUrl ? (
          <a
            href={block.timestampUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-white hover:bg-slate-700"
            title="Watch on YouTube"
          >
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z" />
            </svg>
            {block.time}
          </a>
        ) : (
          <span className="font-mono text-xs text-slate-500">{block.time}</span>
        )}
      </td>
      <td className="py-3 px-3 align-top">
        {hasReasons ? (
          <div className="flex flex-wrap gap-1">
            {block.reasons.map((r) => (
              <span
                key={r}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${reasonColor(r)}`}
              >
                {reasonLabel(r)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">Not stated</span>
        )}
      </td>
      <td className="py-3 px-3 align-top text-sm text-slate-800">
        {block.movedBy ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="py-3 px-3 align-top text-sm text-slate-800">
        {block.secondedBy ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="py-3 pl-3 pr-4 align-top">
        {hasActors || hasReasons ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {open ? "Hide" : "Transcript"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-700 hover:underline"
          >
            {open ? "Hide" : "Show"}
          </button>
        )}
        {open && (
          <p className="mt-2 max-w-sm text-xs text-slate-600 italic leading-5">
            &ldquo;{block.context}&rdquo;
          </p>
        )}
      </td>
    </tr>
  );
}

function MeetingSection({ row }: { row: ExecSessionDetailRow }) {
  const deduped = dedupeBlocks(row.blocks);
  const dateLabel = row.date ? new Date(row.date).toLocaleDateString() : "Unknown date";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Meeting header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dateLabel}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{row.videoTitle}</p>
          {row.meetingId && (
            <Link
              to={`/meetings/${row.meetingId}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              Meeting detail
            </Link>
          )}
        </div>
        <div className="shrink-0 flex gap-3 text-right text-xs text-slate-500">
          <div>
            <p className="font-semibold text-slate-800">{deduped.length}</p>
            <p>session{deduped.length !== 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">{row.voiceVoteCount}</p>
            <p>voice votes</p>
          </div>
        </div>
      </div>

      {/* Session blocks table */}
      {deduped.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pl-4 pr-3 font-semibold">Timestamp</th>
                <th className="py-2 px-3 font-semibold">Reason</th>
                <th className="py-2 px-3 font-semibold">Moved by</th>
                <th className="py-2 px-3 font-semibold">Seconded by</th>
                <th className="py-2 pl-3 pr-4 font-semibold">Context</th>
              </tr>
            </thead>
            <tbody>
              {deduped.map((block, i) => (
                <BlockRow key={`${block.time}-${i}`} block={block} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const ExecSessions = () => {
  const { data, isLoading, error } = useExecSessionDetail();
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <p className="text-sm text-slate-600">Loading executive session records…</p>;
  if (error) return <p className="text-sm text-red-600">Unable to load executive session data.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-slate-600">No executive session transcripts available.</p>;

  const pastYear = new Date();
  pastYear.setFullYear(pastYear.getFullYear() - 1);
  const recentRows = data.filter((r) => r.date && new Date(r.date) >= pastYear);
  const displayed = showAll ? data : recentRows.length > 0 ? recentRows : data;
  const totalVoiceVotes = data.reduce((s, r) => s + r.voiceVoteCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Executive Sessions</h1>
          <p className="mt-1 text-sm text-slate-600">
            {data.length} closed sessions detected across {data.length} meeting recordings
            {" · "}
            {totalVoiceVotes.toLocaleString()} voice vote triggers detected
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.length > recentRows.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-semibold text-indigo-600 hover:underline"
            >
              {showAll ? `Past 12 months (${recentRows.length})` : `All time (${data.length})`}
            </button>
          )}
          <Link to="/dashboard" className="text-sm font-semibold text-slate-700 hover:underline">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {displayed.map((row) => (
          <MeetingSection key={row.videoId} row={row} />
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Data sourced from Whisper speech-to-text transcripts of publicly available meeting recordings.
        Names are first-name references extracted from transcript text.
        Timestamp links open the meeting recording at that point.
      </p>
    </div>
  );
};
