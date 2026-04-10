import { Link } from "react-router-dom";
import { useSummary } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";

export const Dashboard = () => {
  const { data, isLoading, error } = useSummary();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard.</p>;
  if (!data) return null;

  const { summary, recentVotes } = data;

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-5 sm:p-6 lg:p-8">
          <div className="space-y-3">
            <Badge tone="amber">Current extracted coverage</Badge>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
                BCBE Votes currently shows extracted coverage, not a full historical archive.
              </h1>
              <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
                The app has discovered {summary.totalMeetings} meetings, but only{" "}
                {summary.totalVotes} extracted vote items and {summary.totalVoteRecords} extracted
                vote records. Historical coverage is incomplete and should not be read as a full
                archive.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/votes"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                Browse votes
              </Link>
              <Link
                to="/meetings"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                View meetings
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <StatCard
          label="Discovered meetings"
          value={summary.totalMeetings}
          helper="Indexed meeting pages"
        />
        <StatCard
          label="Extracted vote items"
          value={summary.totalVotes}
          helper="Structured vote items"
        />
        <StatCard
          label="Extracted vote records"
          value={summary.totalVoteRecords}
          helper="Member-level recorded votes"
        />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        The extracted set currently includes {summary.nonUnanimousCount} non-unanimous vote item
        {summary.nonUnanimousCount === 1 ? "" : "s"}. Leaderboards below are calculated from
        extracted vote records only.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent extracted vote items</h2>
            <p className="text-sm text-slate-500">
              Each extracted item links to the summary, motion text, vote grid, and official
              source.
            </p>
          </div>
          <Link to="/votes" className="text-sm font-semibold text-slate-800 hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recentVotes.map((vote) => (
            <Link
              to={`/votes/${vote.id}`}
              key={vote.id}
              className="rounded-lg border border-slate-200 p-3 transition hover:border-slate-400 sm:p-4"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {vote.detectedPattern || "vote"}
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">{vote.itemTitle}</p>
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{vote.sourceExcerpt}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dissent leaderboard</h2>
          <p className="text-sm text-slate-500">
            Who most often diverges from the majority in the extracted record.
          </p>
          <div className="mt-4 space-y-3">
            {summary.dissentLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-center justify-between text-sm">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                  {(m.dissentRate * 100).toFixed(1)}% dissent
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Yes-rate leaderboard</h2>
          <p className="text-sm text-slate-500">
            Frequency of approving motions in the extracted record.
          </p>
          <div className="mt-4 space-y-3">
            {summary.yesLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-center justify-between text-sm">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                  {(m.yesRate * 100).toFixed(1)}% yes
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            How to read this dashboard
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Coverage context and display conventions live here, below the extracted vote summary.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-500">Read this site as</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              current extracted coverage, not a full archive
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Default view</p>
            <p className="mt-1 font-semibold text-slate-900">Non-unanimous extracted vote items</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Source display</p>
            <p className="mt-1 font-semibold text-slate-900">URL + excerpt on every vote</p>
          </div>
        </div>
      </section>
    </div>
  );
};
