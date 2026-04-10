import { Link } from "react-router-dom";
import { useMeetings } from "../api/hooks";

export const Meetings = () => {
  const { data, isLoading, error } = useMeetings();

  if (isLoading) return <p>Loading meetings…</p>;
  if (error) return <p className="text-red-600">Failed to load meetings.</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Meetings</h1>
        <p className="text-sm text-slate-600">
          Discovered board meetings with source links and extracted vote coverage status. The
          meeting list is broader than the extracted vote dataset.
        </p>
      </div>
      <div className="grid gap-4">
        {data.map((meeting) => (
          <Link
            to={`/meetings/${meeting.id}`}
            key={meeting.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {new Date(meeting.date).toLocaleDateString()} · {meeting.type}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  (meeting.voteItemCount ?? 0) > 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {(meeting.voteItemCount ?? 0) > 0
                  ? `${meeting.voteItemCount} extracted vote item${meeting.voteItemCount === 1 ? "" : "s"}`
                  : "No extracted vote data"}
              </span>
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">{meeting.title}</p>
            <p className="mt-1 text-sm text-slate-600">
              {(meeting.voteItemCount ?? 0) > 0
                ? "Open extracted vote items and source links for this meeting."
                : "Open meeting details and source links. No vote data has been extracted for this meeting yet."}
            </p>
            <p className="mt-2 text-xs text-slate-500 break-all">Source: {meeting.sourceUrl}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};
