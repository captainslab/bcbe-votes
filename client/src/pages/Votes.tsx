import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVotes } from "../api/hooks";

export const Votes = () => {
  const [nonUnanimousOnly, setNonUnanimousOnly] = useState(true);
  const { data, isLoading, error } = useVotes(nonUnanimousOnly);

  const sorted = useMemo(
    () => (data ?? []).sort((a, b) => (b.meeting?.date || "").localeCompare(a.meeting?.date || "")),
    [data],
  );

  if (isLoading) return <p>Loading votes…</p>;
  if (error) return <p className="text-red-600">Failed to load votes.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Votes</h1>
        <p className="text-sm text-slate-600">
          Showing motions and voting records. Non-unanimous items are surfaced by default.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={nonUnanimousOnly}
            onChange={(e) => setNonUnanimousOnly(e.target.checked)}
          />
          Highlight non-unanimous only
        </label>
      </div>

      <div className="grid gap-4">
        {sorted.map((vote) => (
          <Link
            to={`/votes/${vote.id}`}
            key={vote.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">
                {vote.meeting?.date ? new Date(vote.meeting.date).toLocaleDateString() : "—"} ·{" "}
                {vote.meeting?.title}
              </div>
              {vote.isNonUnanimous ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Non-unanimous
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Unanimous
                </span>
              )}
            </div>
            <p className="mt-2 text-lg font-semibold text-slate-900">{vote.itemTitle}</p>
            <p className="mt-1 text-sm text-slate-600 line-clamp-2">{vote.sourceExcerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};
