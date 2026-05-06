/**
 * importHistoricalBatch.ts
 *
 * Bulk-imports every vote item from a curated list of historical BCBE Regular
 * Board Meetings (2020–2023).  For each meeting the script navigates Chrome to
 * the ViewMeeting page, extracts every agenda item's data-id attribute, then
 * attempts to import each item using the same pipeline as
 * importHistoricalAgendaItem.ts.  Already-imported items are skipped.
 *
 * Usage:
 *   npx tsx src/scripts/importHistoricalBatch.ts --execute
 *   npx tsx src/scripts/importHistoricalBatch.ts --dry-run            # parse only, no DB writes
 *   npx tsx src/scripts/importHistoricalBatch.ts --execute --from=2023 # limit to one year
 *   npx tsx src/scripts/importHistoricalBatch.ts --execute --mid=17819  # single meeting
 */

import WebSocket from "ws";
import http from "http";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import { parseAgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import { persistImportedMeetingVoteItems } from "../ingestion/workflow/importService";
import { buildPersistedMinutesVoteOutput } from "../services/minutesVoteService";
import { db, schema } from "../db";
import { getNeutralPublicPersonName } from "../utils/boardVotes";
import { sanitizeBoardVotesDisplayText, sanitizeBoardVotesPersonName } from "../utils/nameSanitizer";
import { normalizeWhitespace } from "../utils/text";
import type { ParsedVoteItem } from "../ingestion/parsers/simbliParser";

// ─── Constants ────────────────────────────────────────────────────────────────

const EN_SITE_ID = "5NRPgquRlNnivNRBQhp7jw==";
const REMOTE_DEBUG_PORT = 9222;
const SIMBLI_ORIGIN = "https://simbli.eboardsolutions.com";
const SIMBLI_SITE_ID = "200015";

// ─── Meeting list (2020–2023 Regular Board Meetings) ─────────────────────────

const ALL_MEETINGS = [
  { mid: 11786, date: "2020-01-16" },
  { mid: 11978, date: "2020-02-20" },
  { mid: 12142, date: "2020-03-17" },
  { mid: 12238, date: "2020-04-23" },
  { mid: 12385, date: "2020-05-19" },
  { mid: 12553, date: "2020-06-25" },
  { mid: 12711, date: "2020-07-23" },
  { mid: 12884, date: "2020-08-20" },
  { mid: 13052, date: "2020-09-24" },
  { mid: 13155, date: "2020-10-15" },
  { mid: 13329, date: "2020-11-19" },
  { mid: 13426, date: "2020-12-08" },
  { mid: 13593, date: "2021-01-21" },
  { mid: 13793, date: "2021-02-25" },
  { mid: 13931, date: "2021-03-18" },
  { mid: 14081, date: "2021-04-22" },
  { mid: 14282, date: "2021-05-20" },
  { mid: 14471, date: "2021-06-24" },
  { mid: 14589, date: "2021-07-15" },
  { mid: 14930, date: "2021-08-17" },
  { mid: 15153, date: "2021-09-16" },
  { mid: 15364, date: "2021-10-21" },
  { mid: 15552, date: "2021-11-18" },
  { mid: 15664, date: "2021-12-07" },
  { mid: 15903, date: "2022-01-20" },
  { mid: 16050, date: "2022-02-17" },
  { mid: 16259, date: "2022-03-17" },
  { mid: 16573, date: "2022-04-21" },
  { mid: 16921, date: "2022-05-19" },
  { mid: 17165, date: "2022-06-23" },
  { mid: 17354, date: "2022-07-21" },
  { mid: 17609, date: "2022-08-16" },
  { mid: 17819, date: "2022-09-15" },
  { mid: 18040, date: "2022-10-20" },
  { mid: 18232, date: "2022-11-17" },
  { mid: 18351, date: "2022-12-06" },
  { mid: 18582, date: "2023-01-19" },
  { mid: 18739, date: "2023-02-16" },
  { mid: 18955, date: "2023-03-16" },
  { mid: 19145, date: "2023-04-20" },
  { mid: 19354, date: "2023-05-18" },
  { mid: 19592, date: "2023-06-22" },
  { mid: 19781, date: "2023-07-20" },
  { mid: 20031, date: "2023-08-17" },
  { mid: 20394, date: "2023-09-21" },
  { mid: 20940, date: "2023-10-19" },
  { mid: 21413, date: "2023-11-16" },
  { mid: 21562, date: "2023-12-05" },
];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isExecute = args.includes("--execute");
if (isDryRun === isExecute) {
  console.error("Specify exactly one of --dry-run or --execute");
  process.exit(1);
}
const fromYear = args.find((a) => a.startsWith("--from="))?.split("=")[1];
const onlyMid = args.find((a) => a.startsWith("--mid="))?.split("=")[1];

const meetings = ALL_MEETINGS.filter((m) => {
  if (onlyMid) return String(m.mid) === onlyMid;
  if (fromYear) return m.date.startsWith(fromYear);
  return true;
});

// ─── Helpers shared with importHistoricalAgendaItem ──────────────────────────

const buildAgendaHash = (meetingId: number, agendaId: string) =>
  createHash("sha256").update(`${meetingId}:${agendaId}`).digest("hex").slice(0, 16);

const buildSafeAgendaSource = (meetingId: number, agendaId: string) =>
  `simbli-agenda-item:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const buildMeetingSourceUrl = (meetingId: number, agendaId: string) =>
  `simbli-historical-agenda-import:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const buildMeetingMinutesUrl = (meetingId: number, agendaId: string) =>
  `simbli-historical-agenda-minutes:meetingId=${meetingId};agendaHash=${buildAgendaHash(meetingId, agendaId)}`;

const buildVoteItems = (
  output: ReturnType<typeof buildPersistedMinutesVoteOutput>,
  sourceMarker: string,
): ParsedVoteItem[] => {
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
      memberName: getNeutralPublicPersonName(vote.memberName) ?? sanitizeBoardVotesPersonName(vote.memberName),
      value: vote.voteValue,
    })),
  };

  if (output.voteItem.summaryText) voteItem.summaryText = sanitizeBoardVotesDisplayText(output.voteItem.summaryText);
  if (output.voteItem.agendaSection) voteItem.agendaSection = sanitizeBoardVotesDisplayText(output.voteItem.agendaSection);
  if (normalizedMotionText) voteItem.motionText = sanitizeBoardVotesDisplayText(normalizedMotionText);
  if (output.voteItem.motionMadeBy) voteItem.motionMadeBy = getNeutralPublicPersonName(output.voteItem.motionMadeBy) ?? sanitizeBoardVotesPersonName(output.voteItem.motionMadeBy);
  if (output.voteItem.motionSecondedBy) voteItem.motionSecondedBy = getNeutralPublicPersonName(output.voteItem.motionSecondedBy) ?? sanitizeBoardVotesPersonName(output.voteItem.motionSecondedBy);
  if (output.voteItem.result) voteItem.result = sanitizeBoardVotesDisplayText(output.voteItem.result);
  if (output.voteItem.sourceExcerpt) voteItem.sourceExcerpt = sanitizeBoardVotesDisplayText(output.voteItem.sourceExcerpt);
  if (output.voteItem.detectedPattern) voteItem.detectedPattern = output.voteItem.detectedPattern;
  if (output.voteItem.confidenceScore !== undefined) voteItem.confidenceScore = output.voteItem.confidenceScore;

  return [voteItem];
};

const findExistingVoteItem = async (simbliId: string, sourceMarker: string) => {
  const rows = await db
    .select({ id: schema.voteItems.id })
    .from(schema.voteItems)
    .innerJoin(schema.meetings, eq(schema.voteItems.meetingId, schema.meetings.id))
    .where(
      and(
        eq(schema.meetings.simbliId, simbliId),
        eq(schema.voteItems.summarySource, sourceMarker),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

// ─── Chrome CDP session for ViewMeeting navigation ───────────────────────────

type CdpTarget = { id: string; url: string; webSocketDebuggerUrl: string; type: string };

const getCdpTargets = async (): Promise<CdpTarget[]> =>
  new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/list`, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve(JSON.parse(data) as CdpTarget[]));
    }).on("error", reject);
  });

const openNavTab = async (): Promise<string> => {
  const targets = await getCdpTargets();
  // Prefer an existing ViewMeeting tab; otherwise create a new one
  const existing = targets.find((t) => t.url.includes("SB_Meetings/ViewMeeting") && t.webSocketDebuggerUrl);
  if (existing) return existing.webSocketDebuggerUrl;
  const res = await new Promise<CdpTarget>((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: REMOTE_DEBUG_PORT, method: "PUT", path: `/json/new?${encodeURIComponent(`${SIMBLI_ORIGIN}/SB_Meetings/ViewMeeting.aspx?S=${SIMBLI_SITE_ID}`)}` },
      (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(JSON.parse(d) as CdpTarget)); },
    );
    req.on("error", reject);
    req.end();
  });
  return res.webSocketDebuggerUrl;
};

type CdpSession = { send: (method: string, params?: Record<string, unknown>) => Promise<unknown>; close: () => void };

const createCdpSession = async (wsUrl: string): Promise<CdpSession> => {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { id?: number; result?: unknown; error?: { message: string } };
    if (typeof msg.id !== "number") return;
    const h = pending.get(msg.id);
    if (!h) return;
    pending.delete(msg.id);
    if (msg.error) h.reject(new Error(msg.error.message));
    else h.resolve(msg.result ?? {});
  });

  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", () => reject(new Error("CDP connect failed")));
  });

  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, close: () => ws.close() };
};

// Navigate and wait for Angular data-id elements to appear
const extractAgendaItems = async (
  session: CdpSession,
  mid: number,
): Promise<{ agendaId: string; title: string }[]> => {
  const url = `${SIMBLI_ORIGIN}/SB_Meetings/ViewMeeting.aspx?S=${SIMBLI_SITE_ID}&MID=${mid}`;
  await session.send("Page.enable");
  await session.send("Page.navigate", { url });

  // Poll for data-id elements (Angular needs time to render)
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const result = await session.send("Runtime.evaluate", {
      expression: `
        (() => {
          const nodes = Array.from(document.querySelectorAll('[data-id]'));
          if (nodes.length === 0) return null;
          return nodes.map(n => ({
            agendaId: n.getAttribute('data-id'),
            title: (n.querySelector('span') || n).textContent?.trim().slice(0, 120) || ''
          })).filter(x => x.agendaId && x.agendaId.length > 8);
        })()
      `,
      returnByValue: true,
    }) as { result: { value: { agendaId: string; title: string }[] | null } };

    const items = result.result.value;
    if (items && items.length > 0) return items;
  }
  return [];
};

// ─── Per-item import ──────────────────────────────────────────────────────────

type ImportResult = "imported" | "skipped-exists" | "skipped-no-content" | "skipped-no-votes" | "error";

const importItem = async (
  meetingMid: number,
  meetingDate: string,
  agendaId: string,
  itemTitle: string,
): Promise<{ result: ImportResult; detail: string }> => {
  const sourceMarker = buildSafeAgendaSource(meetingMid, agendaId);

  // Idempotence check
  const existing = await findExistingVoteItem(String(meetingMid), sourceMarker);
  if (existing) return { result: "skipped-exists", detail: "already in DB" };

  // Fetch from Simbli via Chrome CDP (search tab)
  let fetched: Awaited<ReturnType<typeof fetchCompleteAgendaItem>>;
  try {
    fetched = await fetchCompleteAgendaItem({
      agendaId,
      enSiteId: EN_SITE_ID,
      meetingId: meetingMid,
      remoteDebugPort: REMOTE_DEBUG_PORT,
    });
  } catch (err) {
    return { result: "skipped-no-content", detail: String(err instanceof Error ? err.message : err) };
  }

  let parsedAgendaItem: ReturnType<typeof parseAgendaItemLoaderResponse>;
  try {
    parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
  } catch {
    return { result: "skipped-no-content", detail: "JSON parse failed" };
  }

  if (parsedAgendaItem.MeetingId !== meetingMid) {
    return { result: "error", detail: `meetingId mismatch: got ${parsedAgendaItem.MeetingId}` };
  }
  if (parsedAgendaItem.itemDetails.EncrID !== agendaId) {
    return { result: "skipped-no-content", detail: "agendaId mismatch (section header)" };
  }

  const output = buildPersistedMinutesVoteOutput(parsedAgendaItem);
  const voteItems = buildVoteItems(output, sourceMarker);
  if (voteItems.length === 0) {
    return { result: "skipped-no-votes", detail: `pattern=${output.voteItem.detectedPattern}` };
  }

  if (isDryRun) {
    return {
      result: "imported",
      detail: `[DRY-RUN] conf=${voteItems[0]!.confidenceScore} pattern=${output.voteItem.detectedPattern}`,
    };
  }

  // Persist
  const meeting = {
    simbliId: String(meetingMid),
    date: new Date(meetingDate).toISOString(),
    title: "Regular Board Meeting",
    type: "Regular Board Meeting",
    sourceUrl: buildMeetingSourceUrl(meetingMid, agendaId),
    minutesUrl: buildMeetingMinutesUrl(meetingMid, agendaId),
  };

  try {
    await persistImportedMeetingVoteItems({ meeting, voteItems });
  } catch (err) {
    return { result: "error", detail: `persist failed: ${String(err instanceof Error ? err.message : err)}` };
  }

  return {
    result: "imported",
    detail: `conf=${voteItems[0]!.confidenceScore} pattern=${output.voteItem.detectedPattern} records=${output.voteRecords.length}`,
  };
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "EXECUTE"}  Meetings: ${meetings.length}`);

  const navWsUrl = await openNavTab();
  const navSession = await createCdpSession(navWsUrl);
  await navSession.send("Runtime.enable");

  const totals = { imported: 0, skippedExists: 0, skippedNoContent: 0, skippedNoVotes: 0, errors: 0 };

  for (const meeting of meetings) {
    console.log(`\n[MID ${meeting.mid}] ${meeting.date} — extracting items...`);

    const items = await extractAgendaItems(navSession, meeting.mid);
    if (items.length === 0) {
      console.log(`  ⚠  No agenda items found (Angular may not have rendered)`);
      continue;
    }
    console.log(`  Found ${items.length} agenda items`);

    for (const item of items) {
      const { result, detail } = await importItem(meeting.mid, meeting.date, item.agendaId, item.title);
      const label = item.title.slice(0, 60).padEnd(60);
      console.log(`  ${result.padEnd(22)} ${label}  ${detail}`);

      if (result === "imported") totals.imported++;
      else if (result === "skipped-exists") totals.skippedExists++;
      else if (result === "skipped-no-content") totals.skippedNoContent++;
      else if (result === "skipped-no-votes") totals.skippedNoVotes++;
      else totals.errors++;

      // Brief pause between items to avoid hammering Chrome CDP
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  navSession.close();

  console.log("\n─── Summary ────────────────────────────────────────");
  console.log(`  Imported:          ${totals.imported}`);
  console.log(`  Skipped (exists):  ${totals.skippedExists}`);
  console.log(`  No content:        ${totals.skippedNoContent}`);
  console.log(`  No votes:          ${totals.skippedNoVotes}`);
  console.log(`  Errors:            ${totals.errors}`);
};

main().catch((err) => { console.error(err); process.exit(1); });
