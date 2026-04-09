import { load } from "cheerio";
import { normalizeWhitespace } from "../../utils/text";

export type ParsedMeetingListingRow = {
  rowIndex: number;
  dateText: string;
  titleText: string;
  minutesText: string;
  typeText: string;
  simbliSiteId?: string;
  simbliId?: string;
  sourceUrl?: string;
  minutesUrl?: string | null;
};

const extractQuotedArgs = (value?: string | null) => {
  if (!value) return [];
  return Array.from(value.matchAll(/"([^"]*)"/g), (match) => match[1] ?? "").filter(Boolean);
};

const extractMeetingId = (onclick?: string | null) => {
  const args = extractQuotedArgs(onclick);
  if (args.length < 2) return null;
  const [siteId, mid] = args;
  if (!siteId || !mid) return null;
  return { siteId, mid };
};

const buildMeetingSourceUrl = (siteId: string, mid: string) =>
  `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=${siteId}&MID=${mid}`;

export const parseMeetingListing = (html: string): ParsedMeetingListingRow[] => {
  const $ = load(html);
  const rows: ParsedMeetingListingRow[] = [];
  const rowSelector = "#ContentPlaceHolder1_MeetingGrid tbody tr, table#ContentPlaceHolder1_MeetingGrid tbody tr";

  $(rowSelector).each((rowIndex, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const dateCell = cells.eq(0);
    const meetingCell = cells.eq(1);
    const minutesCell = cells.eq(2);
    const typeCell = cells.eq(3);

    const dateText =
      normalizeWhitespace(dateCell.find("span").attr("title")) ||
      normalizeWhitespace(dateCell.text());
    const titleAnchor = meetingCell.find("a").first();
    const titleText = normalizeWhitespace(titleAnchor.text());
    const minutesAnchor = minutesCell.find("a").first();
    const minutesText = normalizeWhitespace(minutesAnchor.text() || minutesCell.text());
    const typeText = normalizeWhitespace(typeCell.text());
    const ids = extractMeetingId(titleAnchor.attr("onclick"));

    if (!dateText || !titleText || !typeText || !ids) return;

    rows.push({
      rowIndex,
      dateText,
      titleText,
      minutesText,
      typeText,
      simbliSiteId: ids.siteId,
      simbliId: ids.mid,
      sourceUrl: buildMeetingSourceUrl(ids.siteId, ids.mid),
      // TODO: derive a stable minutes_url once minutes detail parsing is in scope.
      minutesUrl: null,
    });
  });

  return rows;
};
