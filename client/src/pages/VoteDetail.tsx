import { useParams, Link } from "react-router-dom";
import { useVote } from "../api/hooks";

const voteLabel: Record<string, string> = {
  yes: "bg-emerald-50 text-emerald-800",
  no: "bg-rose-50 text-rose-800",
  abstain: "bg-amber-50 text-amber-800",
  recused: "bg-slate-100 text-slate-700",
  absent: "bg-slate-100 text-slate-700",
};

export const VoteDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useVote(id);

  if (isLoading) return <p>Loading vote...</p>;
  if (error) return <p className="text-red-600">Failed to load vote.</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">
            {data.meeting?.date ? new Date(data.meeting.date).toLocaleDateString() : "—"} ·{" "}
            {data.meeting?.title}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">{data.itemTitle}</h1>
          {data.motionText && <p className="mt-1 text-slate-700">{data.motionText}</p>}
        </div>
        <Link to="/votes" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to votes
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Motion by</p>
          <p className="text-lg font-semibold text-slate-900">{data.motionMadeBy || "Unknown"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Seconded by</p>
          <p className="text-lg font-semibold text-slate-900">
            {data.motionSecondedBy || "Unknown"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Result</p>
          <p className="text-lg font-semibold text-slate-900">{data.result || "Recorded"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Vote grid</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {data.voteRecords?.map((record) => (
            <div
              key={record.id}
              className={`rounded-lg px-3 py-3 text-sm font-semibold ${voteLabel[record.voteValue] || "bg-slate-100 text-slate-700"}`}
            >
              <p className="text-slate-900">{record.boardMember?.name || `Member ${record.boardMemberId}`}</p>
              <p className="text-xs uppercase tracking-wide text-slate-600">{record.voteValue}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Source</h2>
        <p className="text-sm text-slate-700">{data.sourceExcerpt}</p>
        {data.meeting?.sourceUrl && (
          <a
            href={data.meeting.sourceUrl}
            target="_blank"
            className="mt-2 inline-flex text-sm font-semibold text-slate-800 underline"
            rel="noreferrer"
          >
            View official source
          </a>
        )}
      </div>
    </div>
  );
};
