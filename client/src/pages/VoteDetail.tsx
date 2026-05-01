import { useParams, Link } from "react-router-dom";
import { useVote } from "../api/hooks";
import { Badge } from "../components/Badge";

const voteTone: Record<string, "emerald" | "rose" | "amber" | "slate"> = {
  yes: "emerald",
  no: "rose",
  abstain: "amber",
  recused: "slate",
  absent: "slate",
};

export const VoteDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useVote(id);

  if (isLoading) return <p>Loading vote...</p>;
  if (error) return <p className="text-red-600">Failed to load vote.</p>;
  if (!data) return null;

  const summarySourceUrl =
    data.summarySource && /^https?:\/\//i.test(data.summarySource) ? data.summarySource : null;
  const officialSourceUrl = summarySourceUrl || data.meeting?.sourceUrl;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {data.meeting?.date ? new Date(data.meeting.date).toLocaleDateString() : "—"} ·{" "}
            {data.meeting?.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{data.itemTitle}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.category === "Needs review" ? "amber" : "blue"}>
              {data.category || "Needs review"}
            </Badge>
            <Badge tone={data.verificationStatus === "verified" ? "emerald" : "amber"}>
              {data.verificationStatus}
            </Badge>
            <Badge tone={data.isNonUnanimous ? "amber" : "emerald"}>
              {data.isNonUnanimous ? "Non-unanimous" : "Unanimous"}
            </Badge>
            <Badge tone="slate">{data.detectedPattern || "vote"}</Badge>
          </div>
        </div>
        <Link to="/votes" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to votes
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Plain-language summary</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {data.summaryText || data.itemTitle}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Original motion</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{data.motionText || "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Result</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{data.result || "Recorded"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Motion made / seconded</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {data.motionMadeBy || "Unknown"} / {data.motionSecondedBy || "Unknown"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Vote grid</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.voteRecords?.map((record) => (
              <div
                key={record.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">
                    {record.boardMember?.name ?? (record.boardMemberId ? `Member ${record.boardMemberId}` : "Unknown member")}
                  </p>
                  <Badge tone={voteTone[record.voteValue] || "slate"}>{record.voteValue}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Source excerpt</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{data.sourceExcerpt || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Official source</h2>
            {officialSourceUrl ? (
              <a
                href={officialSourceUrl}
                target="_blank"
                className="mt-2 break-all text-sm font-semibold text-slate-800 underline"
                rel="noreferrer"
              >
                {officialSourceUrl}
              </a>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Not available.</p>
            )}
            {data.summarySource && !summarySourceUrl && (
              <p className="mt-2 text-xs text-slate-500">
                Summary source: <span className="break-all">{data.summarySource}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
