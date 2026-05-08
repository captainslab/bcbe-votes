import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useVote } from "../api/hooks";
import { Badge } from "../components/Badge";

type VoteTone = "emerald" | "rose" | "amber" | "slate";

const voteTone: Record<string, VoteTone> = {
  yes: "emerald",
  no: "rose",
  abstain: "amber",
  recused: "slate",
  absent: "slate",
};

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const parseConfidence = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= 1) return parsed;
  if (parsed <= 100) return parsed / 100;
  return null;
};

const formatConfidence = (value: string | number | null | undefined) => {
  const normalized = parseConfidence(value);
  if (normalized === null) return "Needs review";
  return `${Math.round(normalized * 100)}%`;
};

const getDisplayTitle = (itemTitle?: string | null, summaryText?: string | null, motionText?: string | null) => {
  const titleCandidates = [itemTitle, summaryText, motionText]
    .map((value) => normalizeText(value))
    .filter((value) => value && value.toLowerCase() !== "needs review");
  return titleCandidates[0] || "Needs review";
};

const getSourceUrl = (sourceUrl?: string | null, meetingSourceUrl?: string | null) => {
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  if (meetingSourceUrl && /^https?:\/\//i.test(meetingSourceUrl)) return meetingSourceUrl;
  return null;
};

const getMeetingLabel = (date?: string | null, title?: string | null, type?: string | null) => {
  const dateLabel = date ? new Date(date).toLocaleDateString() : "Needs review";
  const titleLabel = normalizeText(title) || "Needs review";
  const typeLabel = normalizeText(type) || "Needs review";
  return { dateLabel, titleLabel, typeLabel };
};

const getOutcomeLabel = (result?: string | null) => normalizeText(result) || "Needs review";

const isNeedsReview = (
  category?: string | null,
  verificationStatus?: string | null,
  confidenceScore?: string | number | null,
  sourceAvailability?: string | null,
  title?: string,
  isNonUnanimous?: boolean,
  hasRecords?: boolean,
) => {
  const confidence = parseConfidence(confidenceScore);
  // Verified unanimous items with no individual records are source-limited by design —
  // Simbli only stores roll-call data for non-unanimous votes.
  const unanimousNoRecords = verificationStatus === "verified" && !isNonUnanimous && !hasRecords;
  const lowConfidence = !unanimousNoRecords && confidence !== null && confidence < 0.6;
  return (
    category === "Other / Needs Review" ||
    verificationStatus !== "verified" ||
    sourceAvailability === "unavailable" ||
    lowConfidence ||
    title === "Needs review"
  );
};

export const VoteDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useVote(id);

  const sortedRecords = useMemo(() => {
    const records = (data?.voteRecords ?? []).slice();
    records.sort((a, b) => {
      const aName = normalizeText(a.boardMember?.name) || `Member ${a.boardMemberId ?? ""}`;
      const bName = normalizeText(b.boardMember?.name) || `Member ${b.boardMemberId ?? ""}`;
      return aName.localeCompare(bName);
    });
    return records;
  }, [data?.voteRecords]);

  if (isLoading) return <p>Loading vote…</p>;
  if (error) return <p className="text-red-600">Unable to load vote details right now.</p>;
  if (!data) return <p className="text-slate-700">Vote record not found.</p>;

  const title = getDisplayTitle(data.itemTitle, data.summaryText, data.motionText);
  const meeting = getMeetingLabel(data.meeting?.date, data.meeting?.title, data.meeting?.type);
  const sourceUrl = getSourceUrl(data.sourceUrl, data.meeting?.sourceUrl);
  const outcome = getOutcomeLabel(data.result);
  const needsReview = isNeedsReview(
    data.category,
    data.verificationStatus,
    data.confidenceScore,
    data.sourceAvailability,
    title,
    data.isNonUnanimous,
    sortedRecords.length > 0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {meeting.dateLabel} · {meeting.titleLabel}
          </p>
          <p className="text-sm text-slate-600">Meeting type: {meeting.typeLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.category === "Other / Needs Review" ? "amber" : "blue"}>
              {data.category || "Needs review"}
            </Badge>
            <Badge tone={data.verificationStatus === "verified" ? "emerald" : "amber"}>
              {data.verificationStatus || "needs_review"}
            </Badge>
            <Badge tone={data.isNonUnanimous ? "amber" : "emerald"}>
              {data.isNonUnanimous ? "Non-unanimous" : "Unanimous"}
            </Badge>
            {needsReview && <Badge tone="amber">Needs review</Badge>}
          </div>
        </div>
        <Link to="/votes" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to votes
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Outcome</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{outcome}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Verification status</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{data.verificationStatus || "needs_review"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Confidence score</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{formatConfidence(data.confidenceScore)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Category confidence</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{formatConfidence(data.categoryConfidence)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sanitized vote text</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-slate-900">Item title</dt>
              <dd className="mt-1 text-slate-700">{normalizeText(data.itemTitle) || "Needs review"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Summary text</dt>
              <dd className="mt-1 text-slate-700">{normalizeText(data.summaryText) || "Needs review"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Motion text</dt>
              <dd className="mt-1 text-slate-700">{normalizeText(data.motionText) || "Needs review"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Source excerpt</dt>
              <dd className="mt-1 text-slate-700">{normalizeText(data.sourceExcerpt) || "Needs review"}</dd>
            </div>
            {normalizeText(data.contentText) && (
              <div>
                <dt className="font-semibold text-slate-900">Agenda item content</dt>
                <dd className="mt-1 text-slate-700 whitespace-pre-wrap">{normalizeText(data.contentText)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Source and meeting audit</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-slate-900">Meeting date</dt>
              <dd className="mt-1 text-slate-700">{meeting.dateLabel}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Meeting title</dt>
              <dd className="mt-1 text-slate-700">{meeting.titleLabel}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Meeting type</dt>
              <dd className="mt-1 text-slate-700">{meeting.typeLabel}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Source status</dt>
              <dd className="mt-1 text-slate-700">{data.sourceLabel || "Source unavailable"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Official source</dt>
              <dd className="mt-1 text-slate-700">
                {sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noreferrer" className="break-all underline">
                    {sourceUrl}
                  </a>
                ) : (
                  "Source unavailable"
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Member vote records</h2>
        {sortedRecords.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {data.verificationStatus === "verified" && !data.isNonUnanimous
              ? "Individual votes not recorded in source minutes (unanimous decision)."
              : "No member vote records available for this item."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedRecords.map((record) => {
              const memberName =
                normalizeText(record.boardMember?.name) ||
                (record.boardMemberId ? `Member ${record.boardMemberId}` : "Needs review");
              const voteValue = normalizeText(record.voteValue) || "needs review";
              const tone = voteTone[voteValue.toLowerCase()] || "slate";

              return (
                <div
                  key={record.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{memberName}</p>
                    <Badge tone={tone}>{voteValue}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
