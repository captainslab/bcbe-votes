import { Link } from "react-router-dom";
import { useExecSessionSummary, useSummary } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import type { CategoryStat, VoteItem } from "../types";

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const getVoteTitle = (vote: VoteItem) => {
  const candidates = [vote.itemTitle, vote.motionText, vote.summaryText];
  const firstClean = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && candidate.toLowerCase() !== "needs review");
  return firstClean || "Needs review";
};

const getSourceUrl = (vote: VoteItem) => {
  if (vote.sourceUrl && /^https?:\/\//i.test(vote.sourceUrl)) return vote.sourceUrl;
  if (vote.meeting?.sourceUrl && /^https?:\/\//i.test(vote.meeting.sourceUrl)) return vote.meeting.sourceUrl;
  return null;
};

const getSourceState = (vote: VoteItem) => {
  if (vote.sourceAvailability === "available") return "Source linked";
  return vote.sourceLabel || "Source unavailable";
};

const getNoMemberNames = (vote: VoteItem) =>
  (vote.voteRecords ?? [])
    .filter((record) => String(record.voteValue ?? "").toLowerCase() === "no")
    .map((record) => normalizeText(record.boardMember?.name))
    .filter((name): name is string => Boolean(name));

const boilerplatePrefix = /^The superintendent recommends adoption of a motion\s*["']?\s*to\s+/i;
const boilerplateSuffix = /[,\s]+(?:as (?:amended(?:\s+and)?|stipulated)[\s,]+)?(?:provided\s+to\s+board\s+members|stipulated\s+in\s+the\s+agenda\s+exhibit)\s+under\s+separate\s+cover.*$/i;
const genericBoilerplate = /^(?:approve|adopt)\s+the\s+(?:employment|transfer|suspension|termination|retirement|resignation|appointment)s?\s+of\s+personnel(?:\s+as.*)?$/i;

const cleanMotionText = (raw: string): string | null => {
  const stripped = raw
    .replace(boilerplatePrefix, "")
    .replace(boilerplateSuffix, "")
    .replace(/["']+$/, "")
    .trim();
  if (!stripped || genericBoilerplate.test(stripped)) return null;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

const getVoteSummary = (vote: VoteItem): string | null => {
  const tally = vote.voteTally ?? {};
  const yes = tally.yes ?? 0;
  const no = tally.no ?? 0;
  const abstain = tally.abstain ?? 0;
  const total = yes + no + abstain;
  const carried = yes > no;
  const outcomeVerb = carried ? "approved" : "rejected";

  let outcomeClause = "";
  if (total > 0) {
    if (!vote.isNonUnanimous) {
      outcomeClause = "unanimously";
    } else {
      const tallyStr = abstain > 0 ? `${yes}–${no}, ${abstain} abstained` : `${yes}–${no}`;
      const noNames = getNoMemberNames(vote);
      const dissentPart = noNames.length === 1 ? `, ${noNames[0]} dissenting` : "";
      outcomeClause = `${tallyStr}${dissentPart}`;
    }
  }

  const wrap = (action: string) =>
    outcomeClause
      ? `The board ${outcomeVerb} ${action} (${outcomeClause}).`
      : `The board ${outcomeVerb} ${action}.`;

  const entities = vote.personnelEntities;
  if (entities && entities.length > 0) {
    if (entities.length === 1) {
      const e = entities[0];
      const positionPart = e.position
        ? ` as ${e.position}${e.schoolOrDepartment ? ` (${e.schoolOrDepartment})` : ""}`
        : e.schoolOrDepartment ? ` at ${e.schoolOrDepartment}` : "";
      const replacingPart = e.replacing ? `, replacing ${e.replacing}` : "";
      const datePart = e.effectiveDate ? `, effective ${e.effectiveDate}` : "";
      const action = `the ${e.actionType} of ${e.personName}${positionPart}${replacingPart}${datePart}`;
      return wrap(action);
    }
    const names = entities.slice(0, 2).map((e) =>
      `${e.personName}${e.position ? ` as ${e.position}` : ""}`
    ).join(" and ");
    const more = entities.length > 2 ? ` and ${entities.length - 2} others` : "";
    return wrap(`${entities.length} personnel actions including ${names}${more}`);
  }

  const propEntities = vote.propertyEntities;
  if (propEntities && propEntities.length > 0) {
    const p = propEntities[0];
    const partyPart = p.partyName ? ` with ${p.partyName}` : "";
    const locationPart = p.address ? ` at ${p.address}` : p.location ? ` in ${p.location}` : "";
    const usePart = p.statedUse ? ` for ${p.statedUse}` : "";
    const termPart = p.term ? ` (${p.term})` : "";
    const action = `a ${p.actionType}${partyPart}${locationPart}${usePart}${termPart}`;
    return wrap(action);
  }

  const raw = normalizeText(vote.motionText) || normalizeText(vote.summaryText);
  if (raw) {
    const cleaned = cleanMotionText(raw);
    if (cleaned && cleaned.toLowerCase() !== normalizeText(vote.itemTitle).toLowerCase()) {
      return wrap(`a motion to ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`);
    }
  }

  return null;
};


export const Dashboard = () => {
  const { data, isLoading, error } = useSummary();
  const { data: execSummary } = useExecSessionSummary();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard.</p>;
  if (!data) return null;

  const { summary, recentVotes, categoryStats = [] } = data;
  const leaderboardSampleFloor = 5;
  const hasSmallLeaderboardSamples = [...summary.dissentLeaderboard, ...summary.yesLeaderboard].some(
    (member) => member.totalVotes < leaderboardSampleFloor,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 shadow-2xl sm:p-10">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative">
          <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
            Source-first civic vote records
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Baldwin County Board of Education
            <br />
            <span className="text-indigo-400">vote records, source-traced.</span>
          </h1>
          <p className="mt-4 text-slate-300 text-sm sm:text-base max-w-2xl">
            This is extracted coverage, not a full historical archive. Vote items are shown with source links,
            verification status, and confidence context. Lower-confidence or incomplete records are marked Needs review.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              to="/votes"
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 text-sm font-semibold text-center transition"
            >
              View votes
            </Link>
            <Link
              to="/members"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              View members
            </Link>
            <Link
              to="/alliances"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              Voting alignment
            </Link>
            <Link
              to="/meetings"
              className="rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20 px-4 py-3 text-sm font-semibold text-center transition"
            >
              View meetings
            </Link>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Meetings tracked" value={summary.totalMeetings} helper="Indexed meeting pages" />
        <StatCard label="Vote items extracted" value={summary.totalVotes} helper="Structured vote items" />
        <StatCard
          label="Non-unanimous votes"
          value={summary.nonUnanimousCount}
          helper="Visible dissent/split items"
        />
        <StatCard
          label="Needs-review records"
          value={summary.needsReviewCount ?? "Unavailable"}
          helper={summary.needsReviewCount === undefined ? "Not returned by API" : "Low-confidence or incomplete extraction"}
        />
      </div>

      {/* Executive session callout — transcript-backed */}
      {(() => {
        const transcriptCount = summary.transcriptExecSessionCount ?? 0;
        const fallbackCount = summary.executiveSessionCount ?? 0;
        const displayCount = transcriptCount > 0 ? transcriptCount : fallbackCount;
        const voiceTriggers = summary.totalVoiceVotesTriggers ?? 0;
        const motionCount = summary.totalMotionsDetected ?? 0;
        const latestDate = execSummary?.latestMeeting?.date
          ? new Date(execSummary.latestMeeting.date).toLocaleDateString()
          : null;
        if (displayCount === 0 && voiceTriggers === 0 && motionCount === 0) return null;
        return (
          <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Executive Sessions
              </p>
              {displayCount > 0 && (
                <p className="mt-0.5 text-sm text-slate-700">
                  {displayCount} executive session{displayCount !== 1 ? "s" : ""} detected in the past 12 months
                  {latestDate ? ` — most recent ${latestDate}` : ""}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Detected from meeting video transcripts.{" "}
                {voiceTriggers > 0 && `${voiceTriggers} voice vote trigger${voiceTriggers !== 1 ? "s" : ""}`}
                {voiceTriggers > 0 && motionCount > 0 && " and "}
                {motionCount > 0 && `${motionCount} motion${motionCount !== 1 ? "s" : ""}`}
                {(voiceTriggers > 0 || motionCount > 0) && " detected across available recordings."}
              </p>
              <Link to="/meetings" className="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:underline">
                Review meetings
              </Link>
            </div>
            <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
              Transcript-backed data available
            </span>
          </section>
        );
      })()}

      {categoryStats.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Vote topics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Category distribution across {summary.totalVotes} extracted vote items. Use the Votes page to filter by topic.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Votes</th>
                  <th className="px-4 py-2 text-right">Non-unanimous</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(categoryStats as CategoryStat[]).slice(0, 8).map((stat) => (
                  <tr key={stat.category} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{stat.category}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.totalVotes}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{stat.nonUnanimousVotes > 0 ? stat.nonUnanimousVotes : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {categoryStats.length > 8 && (
            <p className="mt-2 text-xs text-slate-500">
              Showing top 8 of {categoryStats.length} categories. <Link to="/votes" className="underline">View all on Votes page.</Link>
            </p>
          )}
        </section>
      )}

      {/* Recent votes */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent extracted vote items</h2>
            <p className="text-sm text-slate-600">
              Sanitized extracted text with category, verification state, source status, and detail links.
            </p>
          </div>
          <Link to="/votes" className="text-sm font-semibold text-slate-800 hover:underline">
            View all votes
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recentVotes.map((vote) => {
            const title = getVoteTitle(vote);
            const sourceUrl = getSourceUrl(vote);
            const sourceState = getSourceState(vote);
            const summary = getVoteSummary(vote);
            const meetingDate = vote.meeting?.date ? new Date(vote.meeting.date).toLocaleDateString() : "Needs review";
            const isVerified = vote.verificationStatus === "verified";

            return (
              <article
                key={vote.id}
                className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all border-l-4 ${
                  isVerified ? "border-l-emerald-400" : "border-l-amber-400"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={vote.category === "Other / Needs Review" ? "amber" : "blue"}>
                    {vote.category || "Needs review"}
                  </Badge>
                  <Badge tone={isVerified ? "emerald" : "amber"}>
                    {isVerified ? "Verified" : "Needs review"}
                  </Badge>
                  <Badge tone={vote.sourceAvailability === "available" ? "emerald" : "amber"}>{sourceState}</Badge>
                </div>

                <p className="mt-2 text-xs font-medium text-slate-500 uppercase tracking-wide">{meetingDate}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 leading-snug">{title}</h3>

                {summary && (
                  <p className="mt-2 text-sm text-slate-700">{summary}</p>
                )}
                {!summary && normalizeText(vote.sourceExcerpt) && normalizeText(vote.sourceExcerpt) !== "Needs review" && (
                  <p className="mt-2 text-sm text-slate-600 line-clamp-2">{vote.sourceExcerpt}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  {sourceUrl ? (
                    <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline text-slate-700">
                      View official meeting record
                    </a>
                  ) : (
                    <span className="text-slate-400">Source unavailable</span>
                  )}
                  <Link to={`/votes/${vote.id}`} className="font-semibold text-slate-800 underline">
                    View vote detail
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm border-l-4 border-l-amber-400">
        BoardVotes.io is source-first: each vote item should link to its official meeting/minutes source when available.
        Records with weak extraction confidence, missing source context, or unresolved parsing are marked Needs review.
      </div>

      {/* Leaderboards */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dissent leaderboard</h2>
          <p className="text-sm text-slate-500">
            Ranked from extracted votes only. Read each rate with its extracted-vote denominator.
          </p>
          {hasSmallLeaderboardSamples && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Current member samples are small, so these rankings are directional.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {summary.dissentLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    {(m.dissentRate * 100).toFixed(1)}% dissent
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.dissentCount} of {m.totalVotes} extracted vote{m.totalVotes === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Yes-rate leaderboard</h2>
          <p className="text-sm text-slate-500">
            Ranked from extracted votes only. Read each rate with its extracted-vote denominator.
          </p>
          {hasSmallLeaderboardSamples && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Current member samples are small, so these rankings are directional.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {summary.yesLeaderboard.map((m) => (
              <div key={m.memberId} className="flex items-start justify-between gap-3 text-sm hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                <Link to={`/members/${m.memberId}`} className="font-medium text-slate-800">
                  {m.name}
                </Link>
                <div className="text-right">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    {(m.yesRate * 100).toFixed(1)}% yes
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.yesCount} of {m.totalVotes} extracted vote{m.totalVotes === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
