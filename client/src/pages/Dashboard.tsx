import { Link } from "react-router-dom";
import { useSummary } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import type { VoteItem } from "../types";

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const parseConfidence = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= 1) return parsed;
  if (parsed <= 100) return parsed / 100;
  return null;
};

const formatConfidence = (value: string | number | null | undefined) => {
  const normalized = parseConfidence(value);
  if (normalized === null) return "Needs review";
  return `${Math.round(normalized * 100)}%`;
};

const getVoteTitle = (vote: VoteItem) => {
  const candidates = [vote.itemTitle, vote.motionText, vote.summaryText];
  const firstClean = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && candidate.toLowerCase() !== "needs review");
  return firstClean || "Needs review";
};

const getSourceUrl = (vote: VoteItem) => {
  if (vote.sourceUrl && /^https?:\/\//i.test(vote.sourceUrl)) return vote.sourceUrl;
  if (vote.meeting?.sourceUrl && /^https?:\/\//i.test(vote.meeting.sourceUrl)) return vote.meeting.sourceUrl;
  return null;
};

const getSourceState = (vote: VoteItem) => {
  if (vote.sourceAvailability === "available") return "Source linked";
  return vote.sourceLabel || "Source unavailable";
};

const isNeedsReviewVote = (vote: VoteItem) => {
  const confidence = parseConfidence(vote.confidenceScore);
  const title = getVoteTitle(vote);
  // Verified unanimous items are source-limited by design — Simbli only stores
  // roll-call data for non-unanimous votes.
  const unanimousVerified = vote.verificationStatus === "verified" && !vote.isNonUnanimous;
  const lowConfidence = !unanimousVerified && confidence !== null && confidence < 0.6;

  return (
    vote.category === "Other / Needs Review" ||
    vote.verificationStatus !== "verified" ||
    vote.sourceAvailability === "unavailable" ||
    lowConfidence ||
    title === "Needs review"
  );
};

export const Dashboard = () => {
  const { data, isLoading, error } = useSummary();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard.</p>;
  if (!data) return null;

  const { summary, recentVotes } = data;
  const leaderboardSampleFloor = 5;
  const hasSmallLeaderboardSamples = [...summary.dissentLeaderboard, ...summary.yesLeaderboard].some(
    (member) => member.totalVotes < leaderboardSampleFloor,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-5 sm:p-6 lg:p-8">
          <Badge tone="blue">Source-first civic vote records</Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
            BoardVotes.io tracks extracted Baldwin County Board of Education vote records from meeting and minutes sources.
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
            This is extracted coverage, not a full historical archive. Vote items are shown with source links,
            verification status, and confidence context. Lower-confidence or incomplete records are marked Needs review.
          </p>
          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p>
              Meetings tracked: <span className="font-semibold text-slate-900">{summary.totalMeetings}</span>
            </p>
            <p>
              Vote items extracted: <span className="font-semibold text-slate-900">{summary.totalVotes}</span>
            </p>
            <p>
              Non-unanimous vote items: <span className="font-semibold text-slate-900">{summary.nonUnanimousCount}</span>
            </p>
            <p>
              Needs-review records: <span className="font-semibold text-slate-900">{summary.needsReviewCount ?? "Unavailable"}</span>
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Meetings tracked" value={summary.totalMeetings} helper="Indexed meeting pages" />
        <StatCard label="Vote items extracted" value={summary.totalVotes} helper="Structured vote items" />
        <StatCard
          label="Non-unanimous votes"
          value={summary.nonUnanimousCount}
          helper="Visible dissent/split items"
        />
        <StatCard
          label="Needs-review records"
          value={summary.needsReviewCount ?? "Unavailable"}
          helper={summary.needsReviewCount === undefined ? "Not returned by API" : "Low-confidence or incomplete extraction"}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-900">Quick links</h2>
        <p className="mt-1 text-sm text-slate-600">
          Start with filtered vote records, member voting pages, voting alignment, or meeting source pages.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/votes"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-400"
          >
            View votes
          </Link>
          <Link
            to="/members"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-400"
          >
            View members
          </Link>
          <Link
            to="/alliances"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-400"
          >
            View voting alignment
          </Link>
          <Link
            to="/meetings"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:border-slate-400"
          >
            View meetings
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent extracted vote items</h2>
            <p className="text-sm text-slate-600">
              Sanitized extracted text with category, verification state, source status, and detail links.
            </p>
          </div>
          <Link to="/votes" className="text-sm font-semibold text-slate-800 hover:underline">
            View all votes
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recentVotes.map((vote) => {
            const title = getVoteTitle(vote);
            const sourceUrl = getSourceUrl(vote);
            const sourceState = getSourceState(vote);
            const excerpt = normalizeText(vote.sourceExcerpt);
            const confidenceLabel = formatConfidence(vote.confidenceScore);
            const needsReview = isNeedsReviewVote(vote);
            const meetingDate = vote.meeting?.date ? new Date(vote.meeting.date).toLocaleDateString() : "Needs review";

            return (
              <article key={vote.id} className="rounded-lg border border-slate-200 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={vote.category === "Other / Needs Review" ? "amber" : "blue"}>
                    {vote.category || "Needs review"}
                  </Badge>
                  <Badge tone={vote.verificationStatus === "verified" ? "emerald" : "amber"}>
                    {vote.verificationStatus || "needs_review"}
                  </Badge>
                  <Badge tone={vote.sourceAvailability === "available" ? "emerald" : "amber"}>{sourceState}</Badge>
                  {needsReview ? <Badge tone="amber">Needs review</Badge> : null}
                </div>

                <p className="mt-2 text-xs text-slate-500">{meetingDate}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                  {excerpt && excerpt.toLowerCase() !== "needs review" ? excerpt : "Needs review"}
                </p>

                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>
                    Confidence: <span className="font-semibold text-slate-700">{confidenceLabel}</span>
                  </p>
                  <p className="break-all">
                    Source:{" "}
                    {sourceUrl ? (
                      <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline text-slate-700">
                        {sourceUrl}
                      </a>
                    ) : (
                      <span>{sourceState}</span>
                    )}
                  </p>
                </div>

                <div className="mt-3">
                  <Link to={`/votes/${vote.id}`} className="text-sm font-semibold text-slate-800 underline">
                    View vote detail
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        BoardVotes.io is source-first: each vote item should link to its official meeting/minutes source when available.
        Records with weak extraction confidence, missing source context, or unresolved parsing are marked Needs review.
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dissent leaderboard</h2>
          <p className="text-sm text-slate-500">
            Ranked from extracted votes only. Read each rate with its extracted-vote denominator.
          </p>
          {hasSmallLeaderboardSamples && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Current member samples are small, so these rankings are directional.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {summary.dissentLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                    {(m.dissentRate * 100).toFixed(1)}% dissent
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.dissentCount} of {m.totalVotes} extracted vote{m.totalVotes === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Yes-rate leaderboard</h2>
          <p className="text-sm text-slate-500">
            Ranked from extracted votes only. Read each rate with its extracted-vote denominator.
          </p>
          {hasSmallLeaderboardSamples && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Current member samples are small, so these rankings are directional.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {summary.yesLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                    {(m.yesRate * 100).toFixed(1)}% yes
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.yesCount} of {m.totalVotes} extracted vote{m.totalVotes === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
