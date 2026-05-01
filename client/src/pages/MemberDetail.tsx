import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMember, useMemberAlignment, useMembers } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import type { MemberNoVoteItem, PairwiseAlignment } from "../types";

const canonicalMemberNames = new Set([
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
]);

const parserArtifactPatterns = [
  /\bvoting\s*:/i,
  /motion made by/i,
  /motion seconded by/i,
  /unanimously approved/i,
  /action agenda/i,
  /superintendent recommendations/i,
];

const isCanonicalMemberName = (name?: string | null) => Boolean(name && canonicalMemberNames.has(name));

const isValidDetailName = (value?: string | null) => {
  if (!value) return false;
  if (parserArtifactPatterns.some((pattern) => pattern.test(value))) return false;
  return isCanonicalMemberName(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return "Needs review";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

const renderAuditLine = (item: MemberNoVoteItem) => (
  <div className="mt-3 space-y-1 text-xs text-slate-500">
    <p>Meeting date: {formatDate(item.meetingDate)}</p>
    <p>Meeting type: {item.meetingType || "Needs review"}</p>
    <p>Meeting ID: {item.meetingId}</p>
    <p>Verification status: {item.verificationStatus || "needs_review"}</p>
    <p>Confidence score: {item.confidenceScore ?? "Needs review"}</p>
    <p>Category confidence: {item.categoryConfidence ?? "Needs review"}</p>
    <p className="break-all">
      Source: {item.sourceAvailability === "available" ? item.sourceLabel : "Source unavailable"}
    </p>
  </div>
);

const PairwiseSection = ({
  memberId,
  alignment,
  members,
}: {
  memberId: number;
  alignment: { data?: PairwiseAlignment[] };
  members: { data?: { memberId: number; name: string }[] };
}) => {
  const memberNameById = new Map((members.data ?? []).map((member) => [member.memberId, member.name]));
  const relatedPairs = (alignment.data ?? []).filter((pair) => pair.memberAId === memberId || pair.memberBId === memberId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Pairwise alignment</h2>
      <p className="text-sm text-slate-500">Only canonical board members are shown here.</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">With</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Overlap</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Alignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {relatedPairs.map((pair) => {
              const otherId = pair.memberAId === memberId ? pair.memberBId : pair.memberAId;
              return (
                <tr key={`${pair.memberAId}-${pair.memberBId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{memberNameById.get(otherId) || `Member ${otherId}`}</td>
                  <td className="px-4 py-3 text-slate-700">{pair.overlap}</td>
                  <td className="px-4 py-3 text-slate-700">{(pair.alignmentRate * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const MemberDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useMember(id);
  const membersQuery = useMembers();
  const alignment = useMemberAlignment(id);

  const memberId = Number(id);
  const noVoteItems = useMemo<MemberNoVoteItem[]>(() => {
    const items = (data?.noVoteItems ?? []) as MemberNoVoteItem[] | undefined;
    return (items ?? []).filter((item) => isValidDetailName(data?.name) && item.memberVote === "No");
  }, [data]);

  if (isLoading) return <p>Loading member…</p>;
  if (error) return <p className="text-red-600">Failed to load member.</p>;
  if (!data || !isValidDetailName(data.name)) return null;

  const stats = data.stats;
  const totalVotes = Math.max(stats?.totalVotes ?? 0, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Baldwin County Board of Education</p>
          <h1 className="text-3xl font-semibold text-slate-900">{data.name}</h1>
          {data.district ? <p className="mt-1 text-sm text-slate-600">District: {data.district}</p> : null}
        </div>
        <Link to="/members" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to members
        </Link>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total votes" value={stats.totalVotes} />
          <StatCard label="Yes rate" value={`${((stats.yesCount / totalVotes) * 100).toFixed(1)}%`} />
          <StatCard label="No / dissent count" value={stats.noCount} />
          <StatCard
            label="Majority alignment"
            value={`${(stats.majorityAlignmentRate * 100).toFixed(1)}%`}
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Items this member voted no on</h2>
        <p className="text-sm text-slate-500">Only extracted vote records with a recorded No vote are shown.</p>
        <div className="mt-4 space-y-4">
          {noVoteItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No recorded no votes in the currently extracted dataset.
            </div>
          ) : (
            noVoteItems.map((item) => (
              <div key={item.voteItemId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm text-slate-500">{formatDate(item.meetingDate)} · {item.meetingType || "Needs review"}</p>
                    <p className="text-sm text-slate-600">Meeting: {item.meetingTitle || "Needs review"}</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {item.itemTitle !== "Needs review"
                        ? item.itemTitle
                        : item.motionText && item.motionText !== "Needs review"
                          ? item.motionText
                          : "Needs review"}
                    </p>
                    <p className="text-sm text-slate-700">Member vote: No</p>
                    <p className="text-sm text-slate-700">Category: {item.category || "Needs review"}</p>
                    <p className="text-sm text-slate-700">Outcome: {item.overallOutcome || "Needs review"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={item.category === "Needs review" ? "amber" : "blue"}>
                      {item.category || "Needs review"}
                    </Badge>
                    <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
                      {item.verificationStatus || "needs_review"}
                    </Badge>
                    {item.sourceAvailability === "unavailable" && <Badge tone="amber">Needs review</Badge>}
                  </div>
                </div>

                {item.summaryText && <p className="mt-3 text-sm text-slate-700">{item.summaryText}</p>}
                {item.motionText && <p className="mt-2 text-sm text-slate-700">Motion: {item.motionText}</p>}
                {item.sourceExcerpt && <p className="mt-2 text-sm text-slate-600">{item.sourceExcerpt}</p>}

                {renderAuditLine(item)}

                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-semibold text-slate-800 underline"
                  >
                    Open official Simbli meeting/minutes page
                  </a>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Source unavailable</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <PairwiseSection memberId={memberId} alignment={alignment} members={membersQuery} />
    </div>
  );
};
