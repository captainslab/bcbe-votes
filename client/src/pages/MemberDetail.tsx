import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMember, useMemberAlignment, useMembers } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import { useBoardContext } from "../context/BoardContext";
import type { MemberCategoryStat, MemberMotionItem, MemberNoVoteItem, MemberProfile, PairwiseAlignment, PersonnelAction, PropertyAction } from "../types";

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

const MOTIONS_PREVIEW = 10;

const buildMotionCategoryRows = (made: MemberMotionItem[], seconded: MemberMotionItem[]) => {
  const map = new Map<string, { made: number; seconded: number }>();
  for (const item of made) {
    const cat = item.category || "Other / Needs Review";
    const e = map.get(cat) ?? { made: 0, seconded: 0 };
    map.set(cat, { ...e, made: e.made + 1 });
  }
  for (const item of seconded) {
    const cat = item.category || "Other / Needs Review";
    const e = map.get(cat) ?? { made: 0, seconded: 0 };
    map.set(cat, { ...e, seconded: e.seconded + 1 });
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => (b.made + b.seconded) - (a.made + a.seconded));
};

const PLACEHOLDER = "Needs review";
const isPlaceholder = (v?: string | null) => !v || v === PLACEHOLDER;

const resolveTitle = (itemTitle?: string | null, motionText?: string | null) => {
  if (!isPlaceholder(itemTitle)) return itemTitle!;
  if (!isPlaceholder(motionText)) return motionText!;
  return null;
};

const actionTypeLabel: Record<PersonnelAction["actionType"], string> = {
  appointment: "Appointment",
  resignation: "Resignation",
  retirement: "Retirement",
  termination: "Termination",
  transfer: "Transfer",
  leave: "Leave",
  other: "Personnel action",
};

const PropertyEntityDetail = ({ entities }: { entities: PropertyAction[] }) => (
  <div className="mt-2 space-y-2">
    {entities.map((entity, i) => {
      const locationParts = [entity.address, entity.location].filter(Boolean);
      const where = locationParts.join(" — ");
      return (
        <div key={i} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
          <p className="font-medium text-slate-800 capitalize">{entity.actionType}{entity.partyName ? ` · ${entity.partyName}` : ""}</p>
          {where && <p className="mt-0.5 text-slate-600">Location: {where}</p>}
          {entity.statedUse && <p className="mt-0.5 text-slate-600">Proposed use: {entity.statedUse}</p>}
          {entity.term && <p className="mt-0.5 text-slate-500 text-xs">Term: {entity.term}</p>}
        </div>
      );
    })}
  </div>
);

const PersonnelEntityDetail = ({ entities }: { entities: PersonnelAction[] }) => (
  <div className="mt-2 space-y-1.5">
    {entities.map((entity, i) => {
      const detail = [entity.position, entity.schoolOrDepartment].filter(Boolean).join(", ");
      return (
        <div key={i} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
          <p className="font-medium text-slate-800">{entity.personName}</p>
          <p className="mt-0.5 text-slate-600">{actionTypeLabel[entity.actionType] ?? entity.actionType}{detail ? ` — ${detail}` : ""}</p>
          {entity.replacing && <p className="mt-0.5 text-slate-500 text-xs">Replacing: {entity.replacing}</p>}
        </div>
      );
    })}
  </div>
);

const CategoryEntityDetail = ({
  category,
  personnelEntities,
  propertyEntities,
}: {
  category: string;
  personnelEntities?: PersonnelAction[] | null;
  propertyEntities?: PropertyAction[] | null;
}) => {
  const isPersonnel = category === "Personnel";
  const isProperty = category === "Facilities & Property" || category === "Contracts & Procurement";

  if (isPersonnel && personnelEntities?.length) {
    return <PersonnelEntityDetail entities={personnelEntities} />;
  }
  if (isProperty && propertyEntities?.length) {
    return <PropertyEntityDetail entities={propertyEntities} />;
  }
  return null;
};

const MotionRow = ({ item }: { item: MemberMotionItem }) => {
  const title = resolveTitle(item.itemTitle, item.motionText) ?? "—";
  const outcome = getOutcomeFromTally(item.voteTally, item.isNonUnanimous);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm text-slate-500">
            {formatDate(item.meetingDate)} · {item.meetingType || "—"}
          </p>
          <p className="text-base font-semibold text-slate-900 leading-snug">{title}</p>
          {outcome !== "—" && (
            <p className="text-sm text-slate-700">Outcome: {outcome}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Badge tone={item.category === "Other / Needs Review" ? "amber" : "blue"}>
            {item.category || "—"}
          </Badge>
          <Badge
            tone={
              item.verificationStatus === "verified"
                ? "emerald"
                : item.verificationStatus === "unverified"
                  ? "slate"
                  : "amber"
            }
          >
            {item.verificationStatus === "verified"
              ? "Verified"
              : item.verificationStatus === "unverified"
                ? "Agenda sourced"
                : "Pending review"}
          </Badge>
          {item.isNonUnanimous && <Badge tone="amber">Non-unanimous</Badge>}
        </div>
      </div>
      <CategoryEntityDetail
        category={item.category}
        personnelEntities={item.personnelEntities}
        propertyEntities={item.propertyEntities}
      />
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline text-slate-600">
            View official record
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
  const { boardName, boardSlug } = useBoardContext();

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
  const isFccDemo = boardSlug === "fcc";
  const fccProofMeetingCopy =
    "Roll-call vote records captured with mover, seconder, and per-member AYE votes for the proof meeting. Full archive ingestion expands the voting history.";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-5">
          <MemberPortrait name={data.name} />
          <div>
            <p className="text-sm text-slate-600">{boardName}</p>
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
        <div className="space-y-2">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total votes" value={stats.totalVotes} />
            <StatCard label="Yes rate" value={`${((stats.yesCount / totalVotes) * 100).toFixed(1)}%`} />
            <StatCard label="Recorded dissent" value={stats.noCount} />
            <StatCard
              label="Majority alignment"
              value={`${(stats.majorityAlignmentRate * 100).toFixed(1)}%`}
            />
          </div>
          <p className="text-xs text-slate-500">
            Yes % calculated from substantive votes (Yes/No/Abstain), excluding absences.
          </p>
        </div>
      )}

      {(data.categoryStats ?? []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Vote-topic breakdown</h2>
          <p className="mt-1 text-sm text-slate-500">
            Extracted vote records for this member by topic area. Recorded No votes are counted as dissent when explicit member votes are present.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Votes</th>
                  <th className="px-4 py-2 text-right">Recorded No</th>
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recorded dissent and abstentions</h2>
        <p className="text-sm text-slate-500">Shown only when explicit No or Abstain records exist.</p>
        <div className="mt-4 space-y-4">
          {noVoteItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              <p>No recorded No or Abstain votes in the currently extracted dataset.</p>
              {isFccDemo && <p className="mt-1">{fccProofMeetingCopy}</p>}
            </div>
          ) : (
            noVoteItems.map((item) => {
              const title = resolveTitle(item.itemTitle, item.motionText);
              // Show description only once: prefer summaryText, fall back to motionText if different
              const description = !isPlaceholder(item.summaryText) ? item.summaryText : null;
              const showMotion =
                !isPlaceholder(item.motionText) &&
                item.motionText !== item.summaryText &&
                item.motionText !== item.itemTitle;
              const outcome = isPlaceholder(item.overallOutcome) ? "—" : item.overallOutcome!;

              return (
                <div key={item.voteItemId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm text-slate-500">
                        {formatDate(item.meetingDate)} · {item.meetingType || "—"}
                      </p>
                      <p className="text-lg font-semibold text-slate-900 leading-snug">
                        {title ?? "—"}
                      </p>
                      <p className="text-sm text-slate-700">
                        Voted <span className="font-semibold">{item.memberVote}</span>
                        {outcome !== "—" && <> · Outcome: {outcome}</>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Badge tone={item.category === "Other / Needs Review" ? "amber" : "blue"}>
                        {item.category || "—"}
                      </Badge>
                      <Badge
                        tone={
                          item.verificationStatus === "verified"
                            ? "emerald"
                            : item.verificationStatus === "unverified"
                              ? "slate"
                              : "amber"
                        }
                      >
                        {item.verificationStatus === "verified"
                          ? "Verified"
                          : item.verificationStatus === "unverified"
                            ? "Agenda sourced"
                            : "Pending review"}
                      </Badge>
                      <Badge tone={item.sourceAvailability === "available" ? "emerald" : "amber"}>
                        {item.sourceAvailability === "available" ? "Source linked" : "Source unavailable"}
                      </Badge>
                    </div>
                  </div>

                  <CategoryEntityDetail
                    category={item.category}
                    personnelEntities={item.personnelEntities}
                    propertyEntities={item.propertyEntities}
                  />
                  {description && (
                    <p className="mt-3 text-sm text-slate-700 leading-relaxed">{description}</p>
                  )}
                  {showMotion && (
                    <p className="mt-2 text-sm text-slate-600 italic">{item.motionText}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-slate-600"
                      >
                        View official record
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
            })
          )}
        </div>
      </div>

      {((data.motions?.made.length ?? 0) > 0 || (data.motions?.seconded.length ?? 0) > 0) && (() => {
        const made = data.motions!.made;
        const seconded = data.motions!.seconded;
        const madeCarried = made.filter((i) => (i.voteTally.yes ?? 0) > (i.voteTally.no ?? 0)).length;
        const secondedCarried = seconded.filter((i) => (i.voteTally.yes ?? 0) > (i.voteTally.no ?? 0)).length;
        const categoryRows = buildMotionCategoryRows(made, seconded);

        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Motions proposed and seconded</h2>
            <p className="text-sm text-slate-500">
              Vote items where this member made or seconded the motion, from the extracted dataset.
            </p>

            {/* Tally summary */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{made.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Motions made</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{madeCarried}</p>
                <p className="text-xs text-slate-500 mt-0.5">Made & carried</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{seconded.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Motions seconded</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{secondedCarried}</p>
                <p className="text-xs text-slate-500 mt-0.5">Seconded & carried</p>
              </div>
            </div>

            {/* Category breakdown */}
            {categoryRows.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">By category</h3>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2 text-right">Made</th>
                        <th className="px-4 py-2 text-right">Seconded</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {categoryRows.map(([cat, counts]) => (
                        <tr key={cat} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-800">{cat}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{counts.made > 0 ? counts.made : "—"}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{counts.seconded > 0 ? counts.seconded : "—"}</td>
                          <td className="px-4 py-2 text-right font-medium text-slate-900">{counts.made + counts.seconded}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent motions made */}
            {made.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">
                  Most recent motions made
                </h3>
                <div className="space-y-3">
                  {made.slice(0, MOTIONS_PREVIEW).map((item) => (
                    <MotionRow key={item.voteItemId} item={item} />
                  ))}
                </div>
                {made.length > MOTIONS_PREVIEW && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing {MOTIONS_PREVIEW} of {made.length} motions made. See category breakdown above for full counts.
                  </p>
                )}
              </div>
            )}

            {/* Recent motions seconded */}
            {seconded.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 mb-3">
                  Most recent motions seconded
                </h3>
                <div className="space-y-3">
                  {seconded.slice(0, MOTIONS_PREVIEW).map((item) => (
                    <MotionRow key={item.voteItemId} item={item} />
                  ))}
                </div>
                {seconded.length > MOTIONS_PREVIEW && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing {MOTIONS_PREVIEW} of {seconded.length} motions seconded.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <PairwiseSection memberId={memberId} alignment={alignment} members={membersQuery} />
    </div>
  );
};
