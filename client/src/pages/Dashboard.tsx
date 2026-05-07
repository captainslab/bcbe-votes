import { Link } from "react-router-dom";
import { useSummary } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import type { CategoryStat, VoteItem } from "../types";

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


export const Dashboard = () => {
  const { data, isLoading, error } = useSummary();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard.</p>;
  if (!data) return null;

  const { summary, recentVotes, categoryStats = [] } = data;
  const leaderboardSampleFloor = 5;
  const hasSmallLeaderboardSamples = [...summary.dissentLeaderboard, ...summary.yesLeaderboard].some(
    (member) => member.totalVotes < leaderboardSampleFloor,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 shadow-2xl sm:p-10">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative">
          <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
            Source-first civic vote records
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Baldwin County Board of Education
            <br />
            <span className="text-indigo-400">vote records, source-traced.</span>
          </h1>
          <p className="mt-4 text-slate-300 text-sm sm:text-base max-w-2xl">
            This is extracted coverage, not a full historical archive. Vote items are shown with source links,
            verification status, and confidence context. Lower-confidence or incomplete records are marked Needs review.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              to="/votes"
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 text-sm font-semibold text-center transition"
            >
              View votes
            </Link>
            <Link
              to="/members"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              View members
            </Link>
            <Link
              to="/alliances"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              Voting alignment
            </Link>
            <Link
              to="/meetings"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              View meetings
            </Link>
          </div>
        </div>
      </section>

      {/* Stat cards */}
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

      {categoryStats.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Vote topics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Category distribution across {summary.totalVotes} extracted vote items. Use the Votes page to filter by topic.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Votes</th>
                  <th className="px-4 py-2 text-right">Non-unanimous</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(categoryStats as CategoryStat[]).slice(0, 8).map((stat) => (
                  <tr key={stat.category} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{stat.category}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.totalVotes}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.nonUnanimousVotes > 0 ? stat.nonUnanimousVotes : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {categoryStats.length > 8 && (
            <p className="mt-2 text-xs text-slate-500">
              Showing top 8 of {categoryStats.length} categories. <Link to="/votes" className="underline">View all on Votes page.</Link>
            </p>
          )}
        </section>
      )}

      {/* Recent votes */}
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
            const meetingDate = vote.meeting?.date ? new Date(vote.meeting.date).toLocaleDateString() : "Needs review";
            const isVerified = vote.verificationStatus === "verified";

            return (
              <article
                key={vote.id}
                className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all border-l-4 ${
                  isVerified ? "border-l-emerald-400" : "border-l-amber-400"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={vote.category === "Other / Needs Review" ? "amber" : "blue"}>
                    {vote.category || "Needs review"}
                  </Badge>
                  <Badge tone={isVerified ? "emerald" : "amber"}>
                    {isVerified ? "Verified" : "Needs review"}
                  </Badge>
                  <Badge tone={vote.sourceAvailability === "available" ? "emerald" : "amber"}>{sourceState}</Badge>
                </div>

                <p className="mt-2 text-xs font-medium text-slate-500 uppercase tracking-wide">{meetingDate}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 leading-snug">{title}</h3>
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

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm border-l-4 border-l-amber-400">
        BoardVotes.io is source-first: each vote item should link to its official meeting/minutes source when available.
        Records with weak extraction confidence, missing source context, or unresolved parsing are marked Needs review.
      </div>

      {/* Leaderboards */}
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
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
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
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
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
