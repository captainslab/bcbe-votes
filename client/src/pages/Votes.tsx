import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVotes } from "../api/hooks";
import { Badge } from "../components/Badge";
import type { VoteItem } from "../types";

type UnanimityFilter = "all" | "non-unanimous" | "unanimous";
type SortDirection = "desc" | "asc";

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

const getVoteTitle = (vote: VoteItem) => {
  const candidates = [vote.itemTitle, vote.summaryText, vote.motionText];
  const firstClean = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && candidate.toLowerCase() !== "needs review");
  return firstClean || "Needs review";
};

const getOutcomeLabel = (vote: VoteItem) => {
  const tally = vote.voteTally ?? {};
  const yes = tally.yes ?? 0;
  const no = tally.no ?? 0;
  const abstain = tally.abstain ?? 0;
  const total = yes + no + abstain;
  if (total > 0) {
    const carried = yes > no;
    const tallyStr = abstain > 0 ? `${yes}–${no}, ${abstain} abstained` : `${yes}–${no}`;
    return carried ? `Carried (${tallyStr})` : `Failed (${tallyStr})`;
  }
  return "—";
};

const getSourceUrl = (vote: VoteItem) => {
  if (vote.sourceUrl && /^https?:\/\//i.test(vote.sourceUrl)) return vote.sourceUrl;
  if (vote.meeting?.sourceUrl && /^https?:\/\//i.test(vote.meeting.sourceUrl)) return vote.meeting.sourceUrl;
  return null;
};

const getNoVotes = (vote: VoteItem) =>
  (vote.voteRecords ?? []).filter((record) => String(record.voteValue ?? "").toLowerCase() === "no");

const getNoMemberNames = (vote: VoteItem) =>
  getNoVotes(vote)
    .map((record) => normalizeText(record.boardMember?.name))
    .filter((name): name is string => Boolean(name));

const isNeedsReviewVote = (vote: VoteItem) => {
  const confidence = parseConfidence(vote.confidenceScore);
  const title = getVoteTitle(vote);
  // Verified unanimous items are source-limited by design — Simbli only stores
  // roll-call data for non-unanimous votes.
  const unanimousVerified = vote.verificationStatus === "verified" && !vote.isNonUnanimous;
  const hasLowConfidence = !unanimousVerified && confidence !== null && confidence < 0.6;

  return (
    vote.category === "Other / Needs Review" ||
    vote.verificationStatus !== "verified" ||
    vote.sourceAvailability === "unavailable" ||
    hasLowConfidence ||
    title === "Needs review"
  );
};

export const Votes = () => {
  const { data, isLoading, error } = useVotes(false);
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedVerification, setSelectedVerification] = useState("all");
  const [selectedOutcome, setSelectedOutcome] = useState("all");
  const [selectedMember, setSelectedMember] = useState("all");
  const [unanimityFilter, setUnanimityFilter] = useState<UnanimityFilter>("non-unanimous");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [hideNeedsReview, setHideNeedsReview] = useState(true);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedVotes = useMemo(() => {
    const sorted = (data ?? []).slice().sort((a, b) =>
      (a.meeting?.date || "").localeCompare(b.meeting?.date || ""),
    );
    return sortDirection === "desc" ? sorted.reverse() : sorted;
  }, [data, sortDirection]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    sortedVotes.forEach((vote) => {
      const category = normalizeText(vote.category) || "Needs review";
      values.add(category);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sortedVotes]);

  const verificationOptions = useMemo(() => {
    const values = new Set<string>();
    sortedVotes.forEach((vote) => {
      const verification = normalizeText(vote.verificationStatus) || "needs_review";
      values.add(verification);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sortedVotes]);

  const outcomeOptions = useMemo(() => {
    const values = new Set<string>();
    sortedVotes.forEach((vote) => values.add(getOutcomeLabel(vote)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sortedVotes]);

  const memberOptions = useMemo(() => {
    const values = new Set<string>();
    sortedVotes.forEach((vote) => {
      (vote.voteRecords ?? []).forEach((record) => {
        const memberName = normalizeText(record.boardMember?.name);
        if (memberName) values.add(memberName);
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sortedVotes]);

  const filteredVotes = useMemo(() => {
    const query = normalizeText(searchText).toLowerCase();

    return sortedVotes.filter((vote) => {
      const voteTitle = getVoteTitle(vote);
      const outcome = getOutcomeLabel(vote);
      const meetingTitle = normalizeText(vote.meeting?.title);
      const meetingType = normalizeText(vote.meeting?.type);
      const searchable = [
        voteTitle,
        normalizeText(vote.motionText),
        normalizeText(vote.summaryText),
        normalizeText(vote.sourceExcerpt),
        meetingTitle,
        meetingType,
        outcome,
      ]
        .join(" ")
        .toLowerCase();

      if (query && !searchable.includes(query)) return false;

      const category = normalizeText(vote.category) || "Needs review";
      if (selectedCategory !== "all" && category !== selectedCategory) return false;

      const verification = normalizeText(vote.verificationStatus) || "needs_review";
      if (selectedVerification !== "all" && verification !== selectedVerification) return false;

      if (selectedOutcome !== "all" && outcome !== selectedOutcome) return false;

      if (selectedMember !== "all") {
        const hasMember = (vote.voteRecords ?? []).some(
          (record) => normalizeText(record.boardMember?.name) === selectedMember,
        );
        if (!hasMember) return false;
      }

      if (unanimityFilter === "non-unanimous" && !vote.isNonUnanimous) return false;
      if (unanimityFilter === "unanimous" && vote.isNonUnanimous) return false;

      if (needsReviewOnly && !isNeedsReviewVote(vote)) return false;
      if (hideNeedsReview && isNeedsReviewVote(vote)) return false;

      return true;
    });
  }, [
    sortedVotes,
    searchText,
    selectedCategory,
    selectedVerification,
    selectedOutcome,
    selectedMember,
    unanimityFilter,
    needsReviewOnly,
    hideNeedsReview,
  ]);

  if (isLoading) return <p>Loading votes…</p>;
  if (error) return <p className="text-red-600">Unable to load vote records right now.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Votes</h1>
        <p className="text-sm text-slate-600">
          BoardVotes.io shows extracted vote records with source and verification context. This is
          extracted coverage, not a complete historical archive.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Search text
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, motion, summary, meeting..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Category
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Verification
            <select
              value={selectedVerification}
              onChange={(event) => setSelectedVerification(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All statuses</option>
              {verificationOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Outcome
            <select
              value={selectedOutcome}
              onChange={(event) => setSelectedOutcome(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All outcomes</option>
              {outcomeOptions.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Member
            <select
              value={selectedMember}
              onChange={(event) => setSelectedMember(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All members</option>
              {memberOptions.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Unanimity
            <select
              value={unanimityFilter}
              onChange={(event) => setUnanimityFilter(event.target.value as UnanimityFilter)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All vote items</option>
              <option value="non-unanimous">Non-unanimous only</option>
              <option value="unanimous">Unanimous only</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Sort by date
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>

          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hideNeedsReview}
              onChange={(event) => {
                setHideNeedsReview(event.target.checked);
                if (event.target.checked) setNeedsReviewOnly(false);
              }}
            />
            Hide needs-review records
          </label>

          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={needsReviewOnly}
              onChange={(event) => {
                setNeedsReviewOnly(event.target.checked);
                if (event.target.checked) setHideNeedsReview(false);
              }}
            />
            Needs review only
          </label>
        </div>
      </section>

      {filteredVotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No matching votes found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Try removing one or more filters to view additional extracted vote records.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredVotes.map((vote) => {
            const title = getVoteTitle(vote);
            const meetingDate = vote.meeting?.date
              ? new Date(vote.meeting.date).toLocaleDateString()
              : "Needs review";
            const meetingTitle = normalizeText(vote.meeting?.title) || "Needs review";
            const meetingType = normalizeText(vote.meeting?.type) || "Needs review";
            const sourceUrl = getSourceUrl(vote);
            const noMembers = getNoMemberNames(vote);

            return (
              <article
                key={vote.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>
                      {meetingDate} · {meetingTitle}
                    </p>
                    <p>Meeting type: {meetingType}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={vote.category === "Other / Needs Review" ? "amber" : "blue"}>
                      {vote.category || "Needs review"}
                    </Badge>
                    <Badge tone={vote.verificationStatus === "verified" ? "emerald" : "amber"}>
                      {vote.verificationStatus === "verified" ? "Verified" : "Needs review"}
                    </Badge>
                    <Badge tone={vote.isNonUnanimous ? "amber" : "emerald"}>
                      {vote.isNonUnanimous ? "Non-unanimous" : "Unanimous"}
                    </Badge>
                  </div>
                </div>

                <h3 className="mt-3 text-lg font-semibold text-slate-900">{title}</h3>

                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p>
                    <span className="font-semibold text-slate-900">Outcome:</span> {getOutcomeLabel(vote)}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Confidence:</span>{" "}
                    {formatConfidence(vote.confidenceScore)}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="font-semibold text-slate-900">Dissenting / No votes:</span>{" "}
                    {noMembers.length > 0 ? noMembers.join(", ") : "None recorded"}
                  </p>
                </div>

                {normalizeText(vote.sourceExcerpt) && normalizeText(vote.sourceExcerpt) !== "Needs review" && (
                  <p className="mt-3 text-sm text-slate-600 line-clamp-2">{vote.sourceExcerpt}</p>
                )}

                <p className="mt-3 text-xs text-slate-500">
                  Source:{" "}
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-slate-700 underline"
                    >
                      {sourceUrl}
                    </a>
                  ) : (
                    <span>{vote.sourceLabel || "Source unavailable"}</span>
                  )}
                </p>

                <div className="mt-3">
                  <Link to={`/votes/${vote.id}`} className="text-sm font-semibold text-slate-800 underline">
                    View vote detail
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
