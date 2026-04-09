import { Link, useParams } from "react-router-dom";
import { useMeeting } from "../api/hooks";
import { Badge } from "../components/Badge";

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">{item.agendaSection || "Agenda item"}</div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
                  {item.verificationStatus}
                </Badge>
                <Badge tone={item.isNonUnanimous ? "amber" : "emerald"}>
                  {item.isNonUnanimous ? "Non-unanimous" : "Unanimous"}
                </Badge>
                <Badge tone="slate">{item.detectedPattern || "vote"}</Badge>
              </div>
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {item.summaryText || item.itemTitle}
            </p>
            <p className="mt-1 text-sm text-slate-700">{item.motionText || item.itemTitle}</p>
            <p className="mt-2 text-sm text-slate-600 line-clamp-2">{item.sourceExcerpt}</p>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Source URL:</span>{" "}
              <span className="break-all">{item.summarySource || data.sourceUrl}</span>
            </p>
            {item.summarySource && (
              <p className="mt-1 text-xs text-slate-500">Traceable source preserved on the record.</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
};
