import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAlignment, useMembers } from "../api/hooks";
import { useBoardContext } from "../context/BoardContext";
import { Badge } from "../components/Badge";
import type { PairwiseAlignment } from "../types";

// Default canonical roster used only on the BCBE board; other boards derive
// their roster dynamically from the /api/members response so we never leak
// BCBE-specific identities into another board's view.
const bcbeCanonicalMembers = [
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
] as const;

const parserArtifactPattern =
  /(^|\b)(Voting:|Motion seconded by|Motion made by|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS|Mrs\.?|Ms\.?|Mr\.?|Miss|Dr\.?|Mike Johnson)(\b|$)/i;

const toPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatDate = (value?: string | null) => {
  if (!value) return "Needs review";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Needs review" : parsed.toLocaleDateString();
};

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const getDisplayItemText = (pair: PairwiseAlignment, voteIndex: number) => {
  const vote = pair.sharedVotes?.[voteIndex];
  if (!vote) return "Needs review";

  const candidates = [vote.displayText, vote.itemTitle, vote.motionText, vote.summaryText];
  const first = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && candidate.toLowerCase() !== "needs review");

  return first || "Needs review";
};

const getMemberVoteTone = (voteValue?: string) => {
  if (!voteValue) return "slate" as const;
  if (voteValue.toLowerCase() === "no") return "rose" as const;
  if (voteValue.toLowerCase() === "yes") return "emerald" as const;
  return "slate" as const;
};

type HeatCell = {
  memberA: string;
  memberB: string;
  alignmentRate: number;
  overlap: number;
  splitVotes: number;
};

export const Alliances = () => {
  const { boardSlug } = useBoardContext();
  const isBcbe = boardSlug === null || boardSlug === "bcbe";

  const { data, isLoading, error } = useAlignment();
  const members = useMembers();

  // For BCBE we keep the curated canonical roster; for other boards we trust
  // the members API (already board-scoped server-side) as the roster.
  const rosterNames = useMemo<string[]>(() => {
    if (isBcbe) return [...bcbeCanonicalMembers];
    return (members.data ?? []).map((m) => m.name).filter(Boolean);
  }, [isBcbe, members.data]);

  const rosterSet = useMemo(() => new Set<string>(rosterNames), [rosterNames]);

  const [minimumOverlap, setMinimumOverlap] = useState(isBcbe ? 3 : 1);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [unanimityFilter, setUnanimityFilter] = useState<"all" | "non-unanimous-only" | "unanimous-only">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});

  const memberNameById = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.memberId, member.name])),
    [members.data],
  );

  const canonicalMemberById = useMemo(() => {
    const map = new Map<number, string>();
    (members.data ?? []).forEach((member) => {
      if (!rosterSet.has(member.name)) return;
      map.set(member.memberId, member.name);
    });
    return map;
  }, [members.data]);

  const canonicalPairs = useMemo(() => {
    return (data ?? []).filter((pair) => {
      const memberAName = pair.memberAName || memberNameById.get(pair.memberAId);
      const memberBName = pair.memberBName || memberNameById.get(pair.memberBId);
      if (!memberAName || !memberBName) return false;
      if (!rosterSet.has(memberAName)) return false;
      if (!rosterSet.has(memberBName)) return false;
      if (memberAName === memberBName) return false;
      if (parserArtifactPattern.test(memberAName) || parserArtifactPattern.test(memberBName)) return false;
      return true;
    });
  }, [data, memberNameById]);

  const filteredPairs = useMemo(() => {
    return canonicalPairs
      .map((pair) => {
          const sharedVotes = (pair.sharedVotes ?? []).filter((vote) => {
            const category = normalizeText(vote.category) || "Needs review";
            if (categoryFilter !== "all" && category !== categoryFilter) return false;

            if (unanimityFilter === "non-unanimous-only" && !vote.isNonUnanimous) return false;
            if (unanimityFilter === "unanimous-only" && vote.isNonUnanimous) return false;

            if (startDate) {
              const voteDate = vote.meetingDate ? new Date(vote.meetingDate) : null;
              const start = new Date(`${startDate}T00:00:00`);
              if (!voteDate || Number.isNaN(voteDate.getTime()) || voteDate < start) return false;
            }

            if (endDate) {
              const voteDate = vote.meetingDate ? new Date(vote.meetingDate) : null;
              const end = new Date(`${endDate}T23:59:59`);
              if (!voteDate || Number.isNaN(voteDate.getTime()) || voteDate > end) return false;
            }

            return true;
          });

        const sameVotes = sharedVotes.filter((vote) => normalizeText(vote.memberAVote) === normalizeText(vote.memberBVote)).length;
        const splitVotes = sharedVotes.length - sameVotes;
        const overlap = sharedVotes.length;

        const categoriesRepresented = Array.from(
          new Set(sharedVotes.map((vote) => normalizeText(vote.category) || "Needs review")),
        ).sort((a, b) => a.localeCompare(b));

        return {
          ...pair,
          sharedVotes,
          sameVotes,
          differentVotes: splitVotes,
          splitVotes,
          overlap,
          alignmentRate: overlap ? sameVotes / overlap : 0,
          splitRate: overlap ? splitVotes / overlap : 0,
          categoriesRepresented,
        };
      })
      .filter((pair) => pair.overlap >= minimumOverlap)
      .sort((a, b) => {
        if (b.alignmentRate !== a.alignmentRate) return b.alignmentRate - a.alignmentRate;
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        return a.memberAId - b.memberAId;
      });
  }, [canonicalPairs, minimumOverlap, categoryFilter, unanimityFilter, startDate, endDate]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    canonicalPairs.forEach((pair) => {
      (pair.sharedVotes ?? []).forEach((vote) => {
        const category = normalizeText(vote.category) || "Needs review";
        values.add(category);
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [canonicalPairs]);

  const totalExtractedVotesAnalyzed = useMemo(() => {
    const voteIds = new Set<number>();
    filteredPairs.forEach((pair) => {
      (pair.sharedVotes ?? []).forEach((vote) => voteIds.add(vote.voteItemId));
    });
    return voteIds.size;
  }, [filteredPairs]);

  const mostAlignedPair = filteredPairs[0] ?? null;
  const leastAlignedPair = filteredPairs[filteredPairs.length - 1] ?? null;
  const highestOverlapPair = useMemo(
    () => [...filteredPairs].sort((a, b) => b.overlap - a.overlap)[0] ?? null,
    [filteredPairs],
  );

  const disagreements = useMemo(
    () => [...filteredPairs].filter((pair) => pair.splitVotes > 0).sort((a, b) => b.splitVotes - a.splitVotes),
    [filteredPairs],
  );

  const heatCells = useMemo(() => {
    const map = new Map<string, HeatCell>();

    filteredPairs.forEach((pair) => {
      const memberA = (pair.memberAName || memberNameById.get(pair.memberAId) || "Needs review").trim();
      const memberB = (pair.memberBName || memberNameById.get(pair.memberBId) || "Needs review").trim();
      if (!rosterSet.has(memberA)) return;
      if (!rosterSet.has(memberB)) return;

      map.set(`${memberA}|${memberB}`, {
        memberA,
        memberB,
        alignmentRate: pair.alignmentRate,
        overlap: pair.overlap,
        splitVotes: pair.splitVotes,
      });
      map.set(`${memberB}|${memberA}`, {
        memberA: memberB,
        memberB: memberA,
        alignmentRate: pair.alignmentRate,
        overlap: pair.overlap,
        splitVotes: pair.splitVotes,
      });
    });

    return map;
  }, [filteredPairs, memberNameById]);

  const toggleExpanded = (pairKey: string) => {
    setExpandedPairs((current) => ({
      ...current,
      [pairKey]: !current[pairKey],
    }));
  };

  if (isLoading) return <p>Loading voting alignment…</p>;
  if (error) return <p className="text-red-600">Failed to load voting alignment.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Voting Alignment</h1>
        <p className="text-sm text-slate-700">
          Voting alignment is calculated from currently extracted vote records only. It does not prove personal
          alliances, political coordination, or full historical voting behavior.
        </p>
        <p className="text-sm text-slate-600">
          This page compares how canonical BCBE board members voted together or split on extracted vote records.
        </p>
        <p className="text-sm text-slate-600">
          Category alignment shows vote-pattern similarity within a topic area. It is not proof of motive,
          coordination, or personal alliance. Use the Category filter below to explore alignment within a specific
          topic.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Most aligned pair</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {mostAlignedPair
              ? `${mostAlignedPair.memberAName || memberNameById.get(mostAlignedPair.memberAId)} & ${mostAlignedPair.memberBName || memberNameById.get(mostAlignedPair.memberBId)}`
              : "Needs review"}
          </p>
          <p className="text-xs text-slate-600">{mostAlignedPair ? `${toPercent(mostAlignedPair.alignmentRate)} alignment` : "No pair data"}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Least aligned pair</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {leastAlignedPair
              ? `${leastAlignedPair.memberAName || memberNameById.get(leastAlignedPair.memberAId)} & ${leastAlignedPair.memberBName || memberNameById.get(leastAlignedPair.memberBId)}`
              : "Needs review"}
          </p>
          <p className="text-xs text-slate-600">{leastAlignedPair ? `${toPercent(leastAlignedPair.alignmentRate)} alignment` : "No pair data"}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Highest overlap pair</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {highestOverlapPair
              ? `${highestOverlapPair.memberAName || memberNameById.get(highestOverlapPair.memberAId)} & ${highestOverlapPair.memberBName || memberNameById.get(highestOverlapPair.memberBId)}`
              : "Needs review"}
          </p>
          <p className="text-xs text-slate-600">{highestOverlapPair ? `${highestOverlapPair.overlap} shared votes` : "No pair data"}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted vote records analyzed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalExtractedVotesAnalyzed}</p>
          <p className="text-xs text-slate-600">Unique vote items represented by active filters</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Minimum overlap</span>
            <input
              type="number"
              min={1}
              max={200}
              value={minimumOverlap}
              onChange={(event) => setMinimumOverlap(Math.max(1, Number(event.target.value) || 1))}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Unanimity</span>
            <select
              value={unanimityFilter}
              onChange={(event) => setUnanimityFilter(event.target.value as "all" | "non-unanimous-only" | "unanimous-only")}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="all">Include unanimous and non-unanimous</option>
              <option value="non-unanimous-only">Only non-unanimous votes</option>
              <option value="unanimous-only">Only unanimous votes</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Alignment heatmap</h2>
        <p className="text-sm text-slate-600">Rows and columns are canonical board members. Darker cells indicate higher alignment.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-700">Member</th>
                {rosterNames.map((member) => (
                  <th key={member} className="px-3 py-2 text-left font-semibold text-slate-700">
                    {member}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosterNames.map((rowMember) => (
                <tr key={rowMember}>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-slate-800">{rowMember}</th>
                  {rosterNames.map((colMember) => {
                    if (rowMember === colMember) {
                      return (
                        <td key={`${rowMember}-${colMember}`} className="px-3 py-2 text-center text-xs text-slate-500">
                          —
                        </td>
                      );
                    }

                    const cell = heatCells.get(`${rowMember}|${colMember}`);
                    const alignmentRate = cell?.alignmentRate ?? 0;
                    const overlap = cell?.overlap ?? 0;
                    const intensity = Math.max(0.08, Math.min(1, alignmentRate));

                    return (
                      <td key={`${rowMember}-${colMember}`} className="px-2 py-2">
                        <div
                          className="rounded-md border border-slate-200 px-2 py-2 text-center text-xs font-semibold"
                          style={{
                            backgroundColor: `rgba(14, 116, 144, ${intensity * 0.75})`,
                            color: alignmentRate >= 0.6 ? "#ffffff" : "#0f172a",
                          }}
                          title={`Alignment ${toPercent(alignmentRate)} across ${overlap} overlapping votes`}
                        >
                          {overlap > 0 ? toPercent(alignmentRate) : "N/A"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Pair details</h2>
        {filteredPairs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            No alignment pairs match current filters.
          </div>
        ) : (
          filteredPairs.map((pair) => {
            const pairKey = `${pair.memberAId}-${pair.memberBId}`;
            const memberA = pair.memberAName || memberNameById.get(pair.memberAId) || `Member ${pair.memberAId}`;
            const memberB = pair.memberBName || memberNameById.get(pair.memberBId) || `Member ${pair.memberBId}`;
            const votesToShow = (pair.sharedVotes ?? []).slice(0, expandedPairs[pairKey] ? undefined : 4);

            return (
              <article key={pairKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-900">{memberA} & {memberB}</h3>
                    <p className="text-sm text-slate-600">Alignment {toPercent(pair.alignmentRate)} · Overlap {pair.overlap} · Split votes {pair.splitVotes}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="blue">{toPercent(pair.alignmentRate)} aligned</Badge>
                    <Badge tone={pair.splitVotes > 0 ? "amber" : "emerald"}>{pair.splitVotes} split</Badge>
                    {pair.sharedVotes?.some((vote) => vote.sourceAvailability === "unavailable") ? (
                      <Badge tone="amber">Needs review</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  {(pair.categoriesRepresented ?? []).map((category) => (
                    <span key={`${pairKey}-${category}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                      {category}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpanded(pairKey)}
                  className="mt-4 text-sm font-semibold text-slate-700 underline"
                >
                  {expandedPairs[pairKey] ? "Hide shared votes" : "View shared votes"}
                </button>

                <div className="mt-3 space-y-3">
                  {votesToShow.map((vote, index) => {
                    const displayText = getDisplayItemText(pair, index);
                    const sourceMissing = vote.sourceAvailability === "unavailable";

                    return (
                      <div key={`${pairKey}-vote-${vote.voteItemId}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">{displayText}</p>
                        <p className="mt-1 text-xs text-slate-600">{formatDate(vote.meetingDate)} · {vote.meetingType || "Needs review"} · {vote.meetingTitle || "Needs review"}</p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge tone={vote.category === "Needs review" ? "amber" : "blue"}>{vote.category || "Needs review"}</Badge>
                          <Badge tone={vote.verificationStatus === "verified" ? "emerald" : "amber"}>{vote.verificationStatus === "verified" ? "Verified" : "Needs review"}</Badge>
                          <Badge tone={sourceMissing ? "amber" : "slate"}>{sourceMissing ? "Source unavailable" : "Source available"}</Badge>
                          {vote.confidenceScore !== null && vote.confidenceScore !== undefined ? (
                            <Badge tone="slate">Confidence {String(vote.confidenceScore)}</Badge>
                          ) : (
                            <Badge tone="amber">Needs review</Badge>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <Badge tone={getMemberVoteTone(vote.memberAVote)}>{memberA}: {vote.memberAVote || "Needs review"}</Badge>
                          <Badge tone={getMemberVoteTone(vote.memberBVote)}>{memberB}: {vote.memberBVote || "Needs review"}</Badge>
                        </div>

                        <p className="mt-2 text-xs text-slate-600">Outcome: {vote.result || "Needs review"}</p>

                        {vote.sourceUrl ? (
                          <a href={vote.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-slate-800 underline break-all">
                            Open official Simbli meeting/minutes page
                          </a>
                        ) : (
                          <p className="mt-2 text-xs text-slate-600">Source unavailable</p>
                        )}

                        <div className="mt-2 text-[11px] text-slate-500">
                          <p>Meeting ID: {vote.meetingId}</p>
                          <p>Vote item ID: {vote.voteItemId}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!expandedPairs[pairKey] && (pair.sharedVotes?.length ?? 0) > 4 ? (
                  <p className="mt-2 text-xs text-slate-600">Showing 4 of {pair.sharedVotes?.length} shared votes.</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Where members split</h2>
        {disagreements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            No split votes found for current filters.
          </div>
        ) : (
          disagreements.slice(0, 10).map((pair) => {
            const pairKey = `${pair.memberAId}-${pair.memberBId}`;
            const memberA = pair.memberAName || canonicalMemberById.get(pair.memberAId) || `Member ${pair.memberAId}`;
            const memberB = pair.memberBName || canonicalMemberById.get(pair.memberBId) || `Member ${pair.memberBId}`;
            const splitVotes = (pair.sharedVotes ?? []).filter(
              (vote) => normalizeText(vote.memberAVote) !== normalizeText(vote.memberBVote),
            );

            return (
              <section key={`split-${pairKey}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{memberA} vs {memberB}</p>
                    <p className="text-xs text-slate-600">Split votes: {splitVotes.length} · Overlap: {pair.overlap}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(`split-${pairKey}`)}
                    className="text-sm font-semibold text-slate-700 underline"
                  >
                    {expandedPairs[`split-${pairKey}`] ? "Hide split votes" : "View split votes"}
                  </button>
                </div>

                {expandedPairs[`split-${pairKey}`] ? (
                  <div className="mt-3 space-y-3">
                    {splitVotes.length === 0 ? (
                      <p className="text-sm text-slate-600">No split votes in this filtered set.</p>
                    ) : (
                      splitVotes.map((vote, index) => {
                        const sourceMissing = vote.sourceAvailability === "unavailable";
                        return (
                          <article key={`split-vote-${pairKey}-${vote.voteItemId}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">{vote.displayText || vote.itemTitle || "Needs review"}</p>
                            <p className="mt-1 text-xs text-slate-600">{formatDate(vote.meetingDate)} · {vote.meetingType || "Needs review"}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <Badge tone={vote.category === "Needs review" ? "amber" : "blue"}>{vote.category || "Needs review"}</Badge>
                              <Badge tone={vote.verificationStatus === "verified" ? "emerald" : "amber"}>{vote.verificationStatus === "verified" ? "Verified" : "Needs review"}</Badge>
                              <Badge tone={sourceMissing ? "amber" : "slate"}>{sourceMissing ? "Source unavailable" : "Source available"}</Badge>
                              <Badge tone={getMemberVoteTone(vote.memberAVote)}>{memberA}: {vote.memberAVote || "Needs review"}</Badge>
                              <Badge tone={getMemberVoteTone(vote.memberBVote)}>{memberB}: {vote.memberBVote || "Needs review"}</Badge>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">Confidence: {vote.confidenceScore ?? "Needs review"}</p>
                            {vote.sourceUrl ? (
                              <a href={vote.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-slate-800 underline break-all">
                                Open official Simbli meeting/minutes page
                              </a>
                            ) : (
                              <p className="mt-2 text-xs text-slate-600">Source unavailable</p>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <p className="text-xs text-slate-500">
        Looking for member-level stats? Visit <Link to="/members" className="underline">Members</Link>.
      </p>
    </div>
  );
};