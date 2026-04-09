import { Link } from "react-router-dom";
import { useSummary } from "../api/hooks";
import { StatCard } from "../components/StatCard";

export const Dashboard = () => {
  const { data, isLoading, error } = useSummary();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard.</p>;
  if (!data) return null;

  const { summary, recentVotes } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900">Transparency Dashboard</h1>
        <p className="text-slate-600">
          Baldwin County Board of Education voting behavior, sourced directly from Simbli.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Meetings" value={summary.totalMeetings} />
        <StatCard label="Vote Items" value={summary.totalVotes} helper="Recorded motions" />
        <StatCard
          label="Non-unanimous"
          value={summary.nonUnanimousCount}
          helper="Where dissent occurred"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dissent leaderboard</h2>
          <p className="text-sm text-slate-500">Who most often diverges from the majority.</p>
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
          <p className="text-sm text-slate-500">Frequency of approving motions.</p>
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent votes</h2>
            <p className="text-sm text-slate-500">
              Each item links to the full motion, vote grid, and source excerpt.
            </p>
          </div>
          <Link to="/votes" className="text-sm font-semibold text-slate-800 hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {recentVotes.map((vote) => (
            <Link
              to={`/votes/${vote.id}`}
              key={vote.id}
              className="rounded-lg border border-slate-200 p-4 transition hover:border-slate-400"
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
    </div>
  );
};
