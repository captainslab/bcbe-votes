import { load } from "cheerio";
import type * as cheerio from "cheerio";
import dayjs from "dayjs";
import { normalizeWhitespace } from "../../utils/text";
import { normalizeVoteValue } from "../../utils/votes";

export type ParsedMeeting = {
  simbliId: string;
  title: string;
  type: string;
  date: string;
  sourceUrl: string;
  minutesUrl?: string;
};

export type ParsedVoteRecord = {
  memberName: string;
  value: string;
};

export type ParsedVoteItem = {
  agendaSection?: string;
  itemTitle: string;
  summaryText?: string;
  summarySource?: string;
  summaryConfidenceScore?: number;
  motionText?: string;
  motionMadeBy?: string;
  motionSecondedBy?: string;
  result?: string;
  isNonUnanimous: boolean;
  voteTally: Record<string, number>;
  sourceExcerpt?: string;
  verificationStatus: "unverified" | "needs_review" | "verified" | "flagged";
  detectedPattern?: string;
  confidenceScore?: number;
  votes: ParsedVoteRecord[];
};

export const parseMeetingListing = (html: string): ParsedMeeting[] => {
  const $ = load(html);
  const meetings: ParsedMeeting[] = [];

  $("a[href*='ViewMeeting.aspx']").each((_idx, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/MID=([0-9]+)/i);
    if (!match) return;

    const simbliId = match[1];
    if (!simbliId) return;
    const rowText = normalizeWhitespace($(el).text());
    const row = $(el).closest("tr");
    const dateText =
      normalizeWhitespace(row.find("td").eq(0).text()) ||
      normalizeWhitespace($(el).parent().prev().text());
    const typeText = normalizeWhitespace(row.find("td").eq(2).text());

    const parsedDate = dayjs(dateText || undefined);
    const isoDate = parsedDate.isValid() ? parsedDate.toISOString() : new Date().toISOString();

    meetings.push({
      simbliId,
      title: rowText || `Meeting ${simbliId}`,
      type: typeText || "Board Meeting",
      date: isoDate,
      sourceUrl: `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=200015&MID=${simbliId}`,
    });
  });

  return meetings;
};

const parseVoteRows = ($: ReturnType<typeof load>, table: cheerio.Cheerio<any>) => {
  const votes: ParsedVoteRecord[] = [];
  table.find("tr").each((_i: number, row: any) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const rawName = normalizeWhitespace($(cells[0]).text());
    const rawVote = normalizeWhitespace($(cells[1]).text());
    if (!rawName || !rawVote) return;

    votes.push({
      memberName: rawName,
      value: normalizeVoteValue(rawVote),
    });
  });
  return votes;
};

const derivePattern = (votes: ParsedVoteRecord[]) => {
  if (!votes.length) return "summary_only";
  const unique = new Set(votes.map((v) => v.value));
  if (unique.size === 1) return "rollcall_unanimous";
  return "rollcall_mixed";
};

const tallyVotes = (votes: ParsedVoteRecord[]) => {
  const tally: Record<string, number> = {};
  votes.forEach((v) => {
    tally[v.value] = (tally[v.value] ?? 0) + 1;
  });
  return tally;
};

const extractMinutesUrl = ($: ReturnType<typeof load>) => {
  const link = $("a:contains('Minutes'), a:contains('minutes')").first();
  const href = link.attr("href");
  if (href?.startsWith("http")) return href;
  if (href) return `https://simbli.eboardsolutions.com/SB_Meetings/${href.replace(/^\/+/, "")}`;
  return undefined;
};

export const parseMeetingDetail = (html: string, sourceUrl: string) => {
  const $ = load(html);
  const title =
    normalizeWhitespace($("h1, .PageTitle, .page-title").first().text()) || "Board Meeting";
  const dateText =
    normalizeWhitespace($("span:contains('Date')").next().text()) ||
    normalizeWhitespace($("strong:contains('Date')").parent().text());
  const typeText = normalizeWhitespace($("span:contains('Type')").next().text());

  const voteItems: ParsedVoteItem[] = [];
  const agendaSections = $("table, div").filter((_i, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes("motion") || text.includes("vote") || text.includes("recommend");
  });

  agendaSections.each((_i: number, section: any) => {
    const sectionNode = $(section);
    const heading =
      normalizeWhitespace(sectionNode.find("h3, h4, strong").first().text()) ||
      normalizeWhitespace(sectionNode.prev("h3, h4, strong").first().text());
    const motionText = normalizeWhitespace(
      sectionNode.find(":contains('Motion')").first().text().replace(/Motion[:\\s]*/i, ""),
    );
    const motionMadeBy = normalizeWhitespace(
      sectionNode.find(":contains('Made by'), :contains('Motion by')").first().text(),
    );
    const motionSecondedBy = normalizeWhitespace(
      sectionNode.find(":contains('Second'), :contains('Seconded by')").first().text(),
    );
    const result = normalizeWhitespace(
      sectionNode.find(":contains('Result'), :contains('Outcome')").first().text(),
    );

    const voteTable = sectionNode.find("table").first();
    const votes = voteTable.length ? parseVoteRows($, voteTable) : [];
    const detectedPattern = derivePattern(votes);
    const voteTally = tallyVotes(votes);
    const isNonUnanimous = votes.length ? new Set(votes.map((v) => v.value)).size > 1 : false;
    const sourceExcerpt = normalizeWhitespace(sectionNode.text()).slice(0, 750);

    if (!heading && !motionText && !votes.length) return;

    voteItems.push({
      agendaSection: heading,
      itemTitle: heading || motionText || "Vote Item",
      summaryText: heading,
      summarySource: sourceUrl,
      summaryConfidenceScore: heading ? 0.7 : 0.4,
      motionText: motionText || heading,
      motionMadeBy,
      motionSecondedBy,
      result,
      isNonUnanimous,
      voteTally,
      sourceExcerpt,
      verificationStatus: "unverified",
      detectedPattern,
      confidenceScore: votes.length ? 0.8 : 0.5,
      votes,
    });
  });

  return {
    meeting: {
      title,
      date: dayjs(dateText || undefined).toISOString(),
      type: typeText || "Board Meeting",
      sourceUrl,
      minutesUrl: extractMinutesUrl($),
    },
    voteItems,
  };
};
