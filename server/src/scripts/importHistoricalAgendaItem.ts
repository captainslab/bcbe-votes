import { createHash } from "node:crypto";
import type { ParsedVoteItem } from "../ingestion/parsers/simbliParser";
import { and, eq } from "drizzle-orm";
import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import { parseAgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import { persistImportedMeetingVoteItems } from "../ingestion/workflow/importService";
import { buildPersistedMinutesVoteOutput } from "../services/minutesVoteService";
import { db, schema } from "../db";
import { normalizeWhitespace } from "../utils/text";

type CliOptions = {
  dryRun: boolean;
  execute: boolean;
  meetingId: string;
  agendaId: string;
  enSiteId: string;
  meetingTitle: string;
  meetingType: string;
  meetingDate: string;
  remoteDebugPort: number;
};

const usage = [
  "Usage:",
  "  tsx src/scripts/importHistoricalAgendaItem.ts --dry-run --meetingId=<MID> --agendaId=<AgendaId> --enSiteId=<EnSiteId> --meetingDate=<ISO date> [--meetingTitle=<title>] [--meetingType=<type>] [--remoteDebugPort=9222]",
  "  tsx src/scripts/importHistoricalAgendaItem.ts --execute --meetingId=<MID> --agendaId=<AgendaId> --enSiteId=<EnSiteId> --meetingDate=<ISO date> [--meetingTitle=<title>] [--meetingType=<type>] [--remoteDebugPort=9222]",
  "",
  "This one-item historical runner refuses broad/date-range imports.",
].join("\n");

const args = process.argv.slice(2);

const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const hasFlag = (name: string) => args.includes(`--${name}`);

const assertSafeSimbliToken = (name: string, value: string) => {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
    throw new Error(`--${name} contains unsupported characters`);
  }
};

const refuseBroadImportArgs = () => {
  const broadArgs = args.filter((arg) => /^--(startDate|endDate|from|to|range|year|query|limit|batch|all)(=|$)/i.test(arg));
  if (broadArgs.length) {
    throw new Error(`Refusing broad/date-range imports for historical agenda item runner: ${broadArgs.join(", ")}`);
  }
};

const requireArg = (name: string) => {
  const value = readArg(name);
  if (!value) throw new Error(`Missing required --${name}=...`);
  return value;
};

const parseOptions = (): CliOptions => {
  if (hasFlag("help")) {
    console.log(usage);
    process.exit(0);
  }

  refuseBroadImportArgs();
  const dryRun = hasFlag("dry-run");
  const execute = hasFlag("execute");
  if (dryRun === execute) {
    throw new Error("Specify exactly one mode: --dry-run or --execute");
  }

  const meetingId = requireArg("meetingId");
  const agendaId = requireArg("agendaId");
  const enSiteId = requireArg("enSiteId");
  const meetingDate = requireArg("meetingDate");
  if (!/^\d+$/.test(meetingId)) throw new Error("--meetingId must be numeric");
  assertSafeSimbliToken("agendaId", agendaId);
  assertSafeSimbliToken("enSiteId", enSiteId);

  const meetingTitle = readArg("meetingTitle") ?? "Regular Board Meeting";
  const meetingType = readArg("meetingType") ?? meetingTitle;
  const remoteDebugPort = Number(readArg("remoteDebugPort") ?? "9222");
  if (!Number.isInteger(remoteDebugPort) || remoteDebugPort <= 0) {
    throw new Error("--remoteDebugPort must be a positive integer");
  }

  return {
    dryRun,
    execute,
    meetingId,
    agendaId,
    enSiteId,
    meetingTitle,
    meetingType,
    meetingDate,
    remoteDebugPort,
  };
};

const buildMeetingSourceUrl = (meetingId: string, agendaId: string) =>
  `simbli-historical-agenda-import:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const buildMeetingMinutesUrl = (meetingId: string, agendaId: string) =>
  `simbli-historical-agenda-minutes:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const toIsoDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --meetingDate value: ${value}`);
  return parsed.toISOString();
};

const buildAgendaHash = (meetingId: string, agendaId: string) =>
  createHash("sha256").update(`${meetingId}:${agendaId}`).digest("hex").slice(0, 16);

const buildSafeAgendaSource = (meetingId: string, agendaId: string) =>
  `simbli-agenda-item:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const redactBrowserState = (state: unknown) => {
  if (!state || typeof state !== "object") return null;
  const value = state as Record<string, unknown>;
  return {
    href: "[REDACTED]",
    title: value.title,
    siteId: value.siteId,
    enDID: value.enDID ? "[REDACTED]" : null,
    sToken: value.sToken ? "[REDACTED]" : null,
    currUserId: value.currUserId ? "[REDACTED]" : null,
  };
};

const buildVoteItems = (
  output: ReturnType<typeof buildPersistedMinutesVoteOutput>,
  sourceMarker: string,
) => {
  const hasVoteEvidence =
    output.voteRecords.length > 0 ||
    Object.values(output.voteItem.voteTally).some((count) => count > 0) ||
    output.voteItem.detectedPattern !== "minutes_no_vote_evidence";
  if (!hasVoteEvidence) return [];

  const normalizedMotionText = output.voteItem.motionText
    ? normalizeWhitespace(output.voteItem.motionText).replace(/^to\s+/i, "")
    : null;

  const voteItem: ParsedVoteItem = {
    itemTitle: output.voteItem.itemTitle,
    summarySource: sourceMarker,
    summaryConfidenceScore: output.voteItem.summaryConfidenceScore,
    isNonUnanimous: output.voteItem.isNonUnanimous,
    voteTally: output.voteItem.voteTally,
    verificationStatus: output.voteItem.verificationStatus,
    votes: output.voteRecords.map((vote) => ({
      memberName: vote.memberName,
      value: vote.voteValue,
    })),
  };

  if (output.voteItem.summaryText) voteItem.summaryText = output.voteItem.summaryText;
  if (output.voteItem.agendaSection) voteItem.agendaSection = output.voteItem.agendaSection;
  if (normalizedMotionText) voteItem.motionText = normalizedMotionText;
  if (output.voteItem.motionMadeBy) voteItem.motionMadeBy = output.voteItem.motionMadeBy;
  if (output.voteItem.motionSecondedBy) voteItem.motionSecondedBy = output.voteItem.motionSecondedBy;
  if (output.voteItem.result) voteItem.result = output.voteItem.result;
  if (output.voteItem.sourceExcerpt) voteItem.sourceExcerpt = output.voteItem.sourceExcerpt;
  if (output.voteItem.detectedPattern) voteItem.detectedPattern = output.voteItem.detectedPattern;
  if (output.voteItem.confidenceScore !== undefined) voteItem.confidenceScore = output.voteItem.confidenceScore;

  return [voteItem];
};

const findExistingVoteItem = async (simbliId: string, item: ParsedVoteItem) => {
  const rows = await db
    .select({ id: schema.voteItems.id })
    .from(schema.voteItems)
    .innerJoin(schema.meetings, eq(schema.voteItems.meetingId, schema.meetings.id))
    .where(
      and(
        eq(schema.meetings.simbliId, simbliId),
        eq(schema.voteItems.itemTitle, item.itemTitle),
        eq(schema.voteItems.summarySource, item.summarySource ?? ""),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

const main = async () => {
  const options = parseOptions();
  const numericMeetingId = Number(options.meetingId);
  const sourceMarker = buildSafeAgendaSource(options.meetingId, options.agendaId);
  const meeting = {
    simbliId: options.meetingId,
    date: toIsoDate(options.meetingDate),
    title: options.meetingTitle,
    type: options.meetingType,
    sourceUrl: buildMeetingSourceUrl(options.meetingId, options.agendaId),
    minutesUrl: buildMeetingMinutesUrl(options.meetingId, options.agendaId),
  };

  const plannedWriteScope = {
    meeting: `one meeting row for simbli_id ${options.meetingId} if absent`,
    agendaItem: "only the explicit agendaId supplied by operator",
    voteItems: "only vote item(s) parsed from the one session-backed agenda payload",
    voteRecords: "only confidently extracted member roll-call/tally records; none fabricated for narrative-only outcomes",
    excluded: "no date ranges, no broad searches, no batch routes, no other meetings",
  };

  const fetched = await fetchCompleteAgendaItem({
    agendaId: options.agendaId,
    enSiteId: options.enSiteId,
    meetingId: numericMeetingId,
    remoteDebugPort: options.remoteDebugPort,
  });
  const parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
  if (parsedAgendaItem.MeetingId !== numericMeetingId) {
    throw new Error(`Session payload meetingId mismatch: expected ${numericMeetingId}, got ${parsedAgendaItem.MeetingId}`);
  }
  if (parsedAgendaItem.itemDetails.EncrID !== options.agendaId) {
    throw new Error("Session payload agendaId mismatch; refusing to import");
  }

  const output = buildPersistedMinutesVoteOutput(parsedAgendaItem);
  const voteItems = buildVoteItems(output, sourceMarker);
  if (voteItems.length === 0) {
    throw new Error("Dry-run produced zero vote_items; refusing to execute");
  }

  const firstVoteItem = voteItems[0];
  if (!firstVoteItem) {
    throw new Error("Dry-run produced zero vote_items; refusing to execute");
  }

  const existing = await findExistingVoteItem(options.meetingId, firstVoteItem);
  if (options.execute && existing) {
    throw new Error(
      `Vote item already exists for meeting ${options.meetingId} and supplied agenda hash; refusing duplicate import`,
    );
  }

  const result = {
    mode: options.dryRun ? "dry-run" : "execute",
    plannedWriteScope,
    source: {
      meetingId: options.meetingId,
      agendaId: "[REDACTED]",
      enSiteId: "[REDACTED]",
      suppliedAgendaHash: buildAgendaHash(options.meetingId, options.agendaId),
      remoteDebugPort: options.remoteDebugPort,
      requestUrl: buildSafeAgendaSource(options.meetingId, options.agendaId),
      requestPath: "[REDACTED_SESSION_BACKED_PATH]",
      status: fetched.status,
      browserState: redactBrowserState(fetched.state),
    },
    idempotence: {
      existingVoteItemId: existing?.id ?? null,
      executeWouldWrite: options.execute && !existing,
    },
    extracted: {
      meetingId: output.meetingId,
      meetingTitle: output.meetingTitle,
      meetingDateText: output.meetingDateText,
      itemTitle: output.itemTitle,
      agendaHash: buildAgendaHash(options.meetingId, options.agendaId),
      failureReasons: output.failureReasons,
      rawSourceEvidence: output.rawSourceEvidence,
      voteItem: output.voteItem,
      voteRecords: output.voteRecords,
    },
    proposedPersistShape: {
      meeting,
      voteItems,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (options.dryRun) return;

  const persisted = await persistImportedMeetingVoteItems({ meeting, voteItems });
  console.log(JSON.stringify({ mode: "execute-result", persisted }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
