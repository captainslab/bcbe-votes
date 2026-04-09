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
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 p-6 lg:grid-cols-[1.4fr_0.9fr] lg:p-8">
          <div className="space-y-4">
            <Badge tone="blue">Source-traceable and scraper-first</Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Transparent voting records for Baldwin County voters and researchers.
              </h1>
              <p className="max-w-2xl text-slate-600">
                Every meeting, motion, and vote is pulled from Simbli, summarized in plain
                language, and linked back to the original source.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-500">Read this site as</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                a public record, not a commentary feed
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Default view</p>
                <p className="mt-1 font-semibold text-slate-900">Non-unanimous votes</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">Source display</p>
                <p className="mt-1 font-semibold text-slate-900">URL + excerpt on every vote</p>
              </div>
            </div>
          </div>
        </div>
      </section>

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
              Each item links to the summary, motion text, vote grid, and official source.
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
