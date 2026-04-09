import { Link, useParams } from "react-router-dom";
import { useMeeting } from "../api/hooks";

export const MeetingDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useMeeting(id);

  if (isLoading) return <p>Loading meeting…</p>;
  if (error) return <p className="text-red-600">Failed to load meeting.</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">{new Date(data.date).toLocaleDateString()}</p>
          <h1 className="text-3xl font-semibold text-slate-900">{data.title}</h1>
          <p className="text-sm text-slate-600">Type: {data.type}</p>
          {data.sourceUrl && (
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-slate-800 underline"
            >
              Source link
            </a>
          )}
        </div>
        <Link to="/meetings" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to meetings
        </Link>
      </div>

      <div className="space-y-4">
        {data.voteItems?.map((item) => (
          <Link
            to={`/votes/${item.id}`}
            key={item.id}
            className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">{item.agendaSection || "Agenda item"}</div>
              {item.isNonUnanimous && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Non-unanimous
                </span>
              )}
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">{item.itemTitle}</p>
            <p className="text-sm text-slate-600 line-clamp-2">{item.sourceExcerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};
