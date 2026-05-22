import { useState } from "react";
import { Link } from "react-router-dom";
import { useExecSessionDetail, useExecSessionSummary } from "../api/hooks";
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

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function MethodologyTerm({ term, children }: { term: string; children: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-slate-900">{term}</dt>
      <dd className="mt-1 text-sm leading-6 text-slate-600">{children}</dd>
    </div>
  );
}

function BlockRow({ block }: { block: ExecSessionBlock }) {
  const [open, setOpen] = useState(false);
  const hasReasons = block.reasons.length > 0;
  const hasActors = block.movedBy || block.secondedBy;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 pl-4 pr-3 align-top">
        <span className="font-mono text-xs text-slate-500">{block.time}</span>
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
            {open ? "Hide" : "Excerpt"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-700 hover:underline"
          >
            {open ? "Hide" : "Excerpt"}
          </button>
        )}
        {open && (
          <p className="mt-2 max-w-sm text-xs text-slate-600 italic leading-5">
            &ldquo;{block.context.length > 400 ? block.context.slice(0, 400) + "…" : block.context}&rdquo;
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
            <p>block{deduped.length !== 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">{row.voiceVoteCount}</p>
            <p>voice-vote markers</p>
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
                <th className="py-2 px-3 font-semibold">Detected mover</th>
                <th className="py-2 px-3 font-semibold">Detected seconder</th>
                <th className="py-2 pl-3 pr-4 font-semibold">Context excerpt</th>
              </tr>
            </thead>
            <tbody>
              {deduped.map((block, i) => (
                <BlockRow key={`${block.time}-${i}`} block={block} />
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            Detected mover/seconder names come from transcript motion/second phrasing only. They are not proof of individual yes/no votes.
          </p>
        </div>
      )}
    </div>
  );
}

export const ExecSessions = () => {
  const { data, isLoading, error } = useExecSessionDetail();
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useExecSessionSummary();
  const [showAll, setShowAll] = useState(false);

  if (isLoading || summaryLoading) return <p className="text-sm text-slate-600">Loading executive session records…</p>;
  if (error || summaryError) return <p className="text-sm text-red-600">Unable to load executive session data.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-slate-600">No executive session transcripts available.</p>;

  const pastYear = summary?.pastYearStart ? new Date(summary.pastYearStart) : new Date();
  if (!summary?.pastYearStart) pastYear.setFullYear(pastYear.getFullYear() - 1);
  const recentRows = data.filter((r) => r.date && new Date(r.date) >= pastYear);
  const hasRecentRows = recentRows.length > 0;
  const showingAllEntries = showAll || !hasRecentRows;
  const displayed = showingAllEntries ? data : recentRows;
  const allTimeDetected = summary?.totalDetected ?? data.length;
  const recentDetected = summary?.pastYearCount ?? recentRows.length;
  const recentReviewed = summary?.pastYearReviewedCount ?? recentRows.length;
  const totalBlockCount = summary?.totalBlockCount ?? data.reduce((sum, row) => sum + dedupeBlocks(row.blocks).length, 0);
  const showingLabel = showingAllEntries ? "All detected" : "Past 12 months";
  const currentTotal = showingAllEntries ? allTimeDetected : recentDetected;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Executive Sessions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Public-record transcript review of meetings where an executive session was detected.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasRecentRows && data.length > recentRows.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-semibold text-indigo-600 hover:underline"
            >
              {showAll ? "Show past 12 months" : "Show all detected"}
            </button>
          )}
          <Link to="/dashboard" className="text-sm font-semibold text-slate-700 hover:underline">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          title="Past 12 months"
          value={`${recentDetected.toLocaleString()} detected`}
          detail={`Executive-session meetings detected: ${recentDetected.toLocaleString()} · Meetings reviewed: ${recentReviewed.toLocaleString()}`}
        />
        <SummaryCard
          title="All-time detected"
          value={allTimeDetected.toLocaleString()}
          detail={`All-time detected: ${allTimeDetected.toLocaleString()} executive-session meetings`}
        />
        <SummaryCard
          title="Executive-session blocks"
          value={totalBlockCount.toLocaleString()}
          detail={`Executive-session blocks: ${totalBlockCount.toLocaleString()} distinct transcript-detected moments`}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm leading-6 text-slate-700">
          BoardVotes counts meetings where an executive session was detected from public meeting records and transcript review. A meeting may contain more than one executive-session block. Most executive-session motions were handled by voice vote, so individual yes/no votes are usually not recorded.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Methodology definitions</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <MethodologyTerm term="Meeting count">
            Number of meetings with at least one detected executive session.
          </MethodologyTerm>
          <MethodologyTerm term="Session blocks">
            Distinct transcript-detected executive-session moments.
          </MethodologyTerm>
          <MethodologyTerm term="Voice vote">
            Group approval heard in meeting audio; not an individual roll-call vote.
          </MethodologyTerm>
          <MethodologyTerm term="Moved by / Seconded by">
            Transcript-detected motion/second, not proof of an individual yes/no vote.
          </MethodologyTerm>
        </dl>
      </section>

      <div className="flex flex-col gap-2 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-800">Showing: {showingLabel}</p>
        <p className="text-sm text-slate-600">
          Showing {displayed.length.toLocaleString()} of {currentTotal.toLocaleString()} {showingAllEntries ? "all-time detected" : "recent"} entries.
          {" "}
          {showingAllEntries ? "Scroll for all detected entries." : "Use Show all detected for the all-time list."}
        </p>
      </div>

      <div className="space-y-4">
        {displayed.map((row) => (
          <MeetingSection key={row.videoId} row={row} />
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Data sourced from Whisper speech-to-text transcripts of publicly available meeting recordings.
        Context excerpts are capped, and mover/seconder detection is not an individual voting record.
      </p>
    </div>
  );
};
