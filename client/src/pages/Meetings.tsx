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
        <p className="text-sm text-slate-600">Source-linked board meetings with motion data.</p>
      </div>
      <div className="grid gap-4">
        {data.map((meeting) => (
          <Link
            to={`/meetings/${meeting.id}`}
            key={meeting.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
          >
            <div className="text-sm text-slate-500">
              {new Date(meeting.date).toLocaleDateString()} · {meeting.type}
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">{meeting.title}</p>
            <p className="text-xs text-slate-500">Source: {meeting.sourceUrl}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};
