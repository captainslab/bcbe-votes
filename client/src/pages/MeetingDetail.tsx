import { Link, useParams } from "react-router-dom";
import { useMeeting } from "../api/hooks";
import { Badge } from "../components/Badge";

export const MeetingDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useMeeting(id);

  if (isLoading) return <p>Loading meeting…</p>;
  if (error) return <p className="text-red-600">Failed to load meeting.</p>;
  if (!data) return null;

  const voteItemCount = data.voteItems?.length ?? 0;

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
        {voteItemCount === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">No extracted vote data yet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No vote data has been extracted for this meeting yet. This does not mean no vote
              occurred.
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">Minutes source:</span>{" "}
                {data.minutesUrl ? "available" : "not captured for this meeting"}
              </p>
              {data.sourceUrl && (
                <a
                  href={data.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold text-slate-800 underline"
                >
                  Open official meeting page
                </a>
              )}
            </div>
          </div>
        ) : (
          data.voteItems?.map((item) => {
            const summarySourceUrl =
              item.summarySource && /^https?:\/\//i.test(item.summarySource)
                ? item.summarySource
                : null;
            const officialSourceUrl = summarySourceUrl || data.sourceUrl;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">{item.agendaSection || "Agenda item"}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={item.category === "Needs review" ? "amber" : "blue"}>
                      {item.category || "Needs review"}
                    </Badge>
                    <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
                      {item.verificationStatus}
                    </Badge>
                    <Badge tone={item.isNonUnanimous ? "amber" : "emerald"}>
                      {item.isNonUnanimous ? "Non-unanimous" : "Unanimous"}
                    </Badge>
                    <Badge tone="slate">{item.detectedPattern || "vote"}</Badge>
                  </div>
                </div>
                <Link to={`/votes/${item.id}`} className="block">
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {item.summaryText || item.itemTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{item.motionText || item.itemTitle}</p>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-2">{item.sourceExcerpt}</p>
                </Link>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <Link to={`/votes/${item.id}`} className="font-semibold text-slate-800 underline">
                    Open vote detail
                  </Link>
                  {officialSourceUrl && (
                    <a
                      href={officialSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-semibold text-slate-800 underline"
                    >
                      Official source
                    </a>
                  )}
                </div>
                {item.summarySource && !summarySourceUrl && (
                  <p className="mt-2 text-xs text-slate-500">
                    Summary source: <span className="break-all">{item.summarySource}</span>
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
