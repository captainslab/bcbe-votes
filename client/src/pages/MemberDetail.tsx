import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMember, useMemberAlignment, useMembers } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import type { MemberCategoryStat, MemberMotionItem, MemberNoVoteItem, MemberProfile, PairwiseAlignment } from "../types";

const memberPortraits: Record<string, string> = {
  "Ken Bradley": "/board-members/ken-bradley.jpg",
  "Andrea Lindsey": "/board-members/andrea-lindsey.jpg",
  "Tony Myrick": "/board-members/tony-myrick.jpg",
  "Rondi Kirby": "/board-members/rondi-kirby.jpg",
  "Jason P. Woerner": "/board-members/jason-p-woerner.jpg",
  "Cecil Christenberry": "/board-members/cecil-christenberry.jpg",
  "April Bradley": "/board-members/april-bradley.jpg",
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

const MemberPortrait = ({ name }: { name: string }) => {
  const [errored, setErrored] = useState(false);
  const src = memberPortraits[name];

  if (!src || errored) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-300 text-2xl font-semibold text-slate-600">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="h-24 w-24 shrink-0 rounded-full object-cover object-top shadow-sm"
      onError={() => setErrored(true)}
    />
  );
};

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

const formatTerm = (profile?: MemberProfile | null) => {
  if (!profile) return null;
  if (profile.termStart && profile.termEnd) return `${profile.termStart}-${profile.termEnd}`;
  if (profile.termStart) return `${profile.termStart}`;
  if (profile.termEnd) return `${profile.termEnd}`;
  return null;
};

const getOutcomeFromTally = (tally: Record<string, number>, isNonUnanimous: boolean) => {
  const yes = tally.yes ?? 0;
  const no = tally.no ?? 0;
  const abstain = tally.abstain ?? 0;
  const total = yes + no + abstain;
  if (total === 0) return "—";
  const verb = yes > no ? "Carried" : "Failed";
  if (!isNonUnanimous) return `${verb} (unanimous)`;
  return abstain > 0 ? `${verb} (${yes}–${no}, ${abstain} abstained)` : `${verb} (${yes}–${no})`;
};

const MotionRow = ({ item }: { item: MemberMotionItem }) => {
  const title = item.itemTitle && item.itemTitle !== "Needs review"
    ? item.itemTitle
    : item.motionText && item.motionText !== "Needs review"
      ? item.motionText
      : "Needs review";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm text-slate-500">{formatDate(item.meetingDate)} · {item.meetingType || "Needs review"}</p>
          <p className="text-base font-semibold text-slate-900 leading-snug">{title}</p>
          <p className="text-sm text-slate-700">
            Outcome: {getOutcomeFromTally(item.voteTally, item.isNonUnanimous)}
          </p>
          <p className="text-sm text-slate-600">Category: {item.category || "Needs review"}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Badge tone={item.category === "Other / Needs Review" ? "amber" : "blue"}>
            {item.category || "Needs review"}
          </Badge>
          <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
            {item.verificationStatus === "verified" ? "Verified" : "Needs review"}
          </Badge>
          {item.isNonUnanimous && <Badge tone="amber">Non-unanimous</Badge>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline text-slate-600">
            View official meeting record
          </a>
        ) : (
          <span>Source unavailable</span>
        )}
        <Link to={`/votes/${item.voteItemId}`} className="font-semibold text-slate-700 underline">
          View vote detail
        </Link>
      </div>
    </div>
  );
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
    return (items ?? []).filter(
      (item) => isValidDetailName(data?.name) && (item.memberVote === "No" || item.memberVote === "Abstain"),
    );
  }, [data]);

  if (isLoading) return <p>Loading member…</p>;
  if (error) return <p className="text-red-600">Failed to load member.</p>;
  if (!data || !isValidDetailName(data.name)) return null;

  const stats = data.stats;
  const profile = data.profile;
  const totalVotes = Math.max(stats?.totalVotes ?? 0, 1);
  const term = formatTerm(profile);
  const hasProfileDetails = Boolean(
    profile?.roleTitle ||
      profile?.districtDescription?.length ||
      profile?.committees?.length ||
      term ||
      profile?.officialPhone,
  );
  const hasOfficialContact = Boolean(profile?.officialContactUrl || profile?.officialContactEmail || profile?.officialPhone);
  const sourceLinks = profile?.profileSourceUrls ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-5">
          <MemberPortrait name={data.name} />
          <div>
            <p className="text-sm text-slate-600">Baldwin County Board of Education</p>
            <h1 className="text-3xl font-semibold text-slate-900">{data.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{profile?.district || data.district || "District not yet sourced"}</p>
            {profile?.roleTitle ? <p className="mt-1 text-sm text-slate-600">{profile.roleTitle}</p> : null}
            {profile?.officialProfileUrl ? (
              <a
                href={profile.officialProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-slate-700 underline"
              >
                Official board profile source
              </a>
            ) : null}
          </div>
        </div>
        <Link to="/members" className="shrink-0 text-sm font-semibold text-slate-700 hover:underline">
          Back to members
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Profile details</h2>
        {hasProfileDetails ? (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {term ? <p>Term: {term}</p> : null}
            {profile?.officialPhone ? <p>Official phone: {profile.officialPhone}</p> : null}
            {profile?.districtDescription?.length ? (
              <div>
                <p className="font-medium text-slate-800">District description</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {profile.districtDescription.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {profile?.committees?.length ? (
              <div>
                <p className="font-medium text-slate-800">Committees</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {profile.committees.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Profile details not yet sourced.</p>
        )}

        <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-700">Official contact</h3>
        {hasOfficialContact ? (
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {profile?.officialContactEmail ? <p>Email: {profile.officialContactEmail}</p> : null}
            {profile?.officialPhone ? <p>Phone: {profile.officialPhone}</p> : null}
            {profile?.officialContactUrl ? (
              <a
                href={profile.officialContactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-semibold text-slate-700 underline"
              >
                Official contact link
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Official contact not yet sourced.</p>
        )}

        <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-700">Sources</h3>
        {sourceLinks.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {sourceLinks.map((url) => (
              <li key={url} className="break-all">
                <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-slate-700 underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Profile details not yet sourced.</p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Profile verification status: {profile?.profileVerificationStatus ?? "not yet sourced"}
        </p>
        <p className="text-xs text-slate-500">
          Profile last reviewed: {profile?.profileLastReviewedAt ? formatDate(profile.profileLastReviewedAt) : "not yet sourced"}
        </p>
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

      {(data.categoryStats ?? []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Vote-topic breakdown</h2>
          <p className="mt-1 text-sm text-slate-500">
            Extracted vote records for this member by topic area. No votes indicate a recorded dissent.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Votes</th>
                  <th className="px-4 py-2 text-right">No votes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.categoryStats as MemberCategoryStat[]).map((stat) => (
                  <tr key={stat.category} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{stat.category}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.totalVotes}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.noVotes > 0 ? stat.noVotes : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {((data.motions?.made.length ?? 0) > 0 || (data.motions?.seconded.length ?? 0) > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Motions proposed and seconded</h2>
          <p className="text-sm text-slate-500">
            Vote items where this member made or seconded the motion, from the extracted dataset.
          </p>

          {(data.motions?.made.length ?? 0) > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">
                Motions made ({data.motions!.made.length})
              </h3>
              <div className="space-y-3">
                {data.motions!.made.map((item) => (
                  <MotionRow key={item.voteItemId} item={item} />
                ))}
              </div>
            </div>
          )}

          {(data.motions?.seconded.length ?? 0) > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">
                Motions seconded ({data.motions!.seconded.length})
              </h3>
              <div className="space-y-3">
                {data.motions!.seconded.map((item) => (
                  <MotionRow key={item.voteItemId} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">No and abstained votes</h2>
        <p className="text-sm text-slate-500">Only extracted vote records with a recorded No or Abstain are shown.</p>
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
                    <p className="text-sm text-slate-700">Member vote: {item.memberVote}</p>
                    <p className="text-sm text-slate-700">Category: {item.category || "Needs review"}</p>
                    <p className="text-sm text-slate-700">Outcome: {item.overallOutcome || "Needs review"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={item.category === "Other / Needs Review" ? "amber" : "blue"}>
                      {item.category || "Needs review"}
                    </Badge>
                    <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
                      {item.verificationStatus === "verified" ? "Verified" : "Needs review"}
                    </Badge>
                    <Badge tone={item.sourceAvailability === "available" ? "emerald" : "amber"}>
                      {item.sourceAvailability === "available" ? "Source linked" : "Source unavailable"}
                    </Badge>
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
