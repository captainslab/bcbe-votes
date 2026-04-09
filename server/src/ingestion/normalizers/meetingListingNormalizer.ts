import { normalizeWhitespace } from "../../utils/text";
import type { ParsedMeetingListingRow } from "../parsers/meetingListingParser";

export type NormalizedMeetingListingRow = {
  simbliSiteId: string;
  simbliId: string;
  date: string;
  title: string;
  type: string;
  sourceUrl: string;
  minutesUrl: string | null;
  minutesText: string;
  rawDateText: string;
};

export type MeetingListingNormalizationError = {
  rowIndex: number;
  reason: string;
  simbliId?: string;
};

const nthWeekdayOfMonth = (year: number, monthIndex: number, weekday: number, nth: number) => {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const delta = (weekday - firstDay + 7) % 7;
  return 1 + delta + (nth - 1) * 7;
};

const getCentralOffsetMinutes = (year: number, month: number, day: number, hour: number) => {
  const dstStartDay = nthWeekdayOfMonth(year, 2, 0, 2);
  const dstEndDay = nthWeekdayOfMonth(year, 10, 0, 1);

  if (month < 3 || month > 11) return -360;
  if (month > 3 && month < 11) return -300;

  if (month === 3) {
    if (day > dstStartDay) return -300;
    if (day < dstStartDay) return -360;
    return hour >= 2 ? -300 : -360;
  }

  if (month === 11) {
    if (day < dstEndDay) return -300;
    if (day > dstEndDay) return -360;
    return hour < 2 ? -300 : -360;
  }

  return -360;
};

const parseListingDate = (value: string) => {
  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  if (!match) return null;

  const [, monthText, dayText, yearText, hourText, minuteText, periodText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  let hour = Number(hourText) % 12;
  if (periodText && periodText.toUpperCase() === "PM") hour += 12;
  const minute = Number(minuteText);
  const offsetMinutes = getCentralOffsetMinutes(year, month, day, hour);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;
  return new Date(utcMillis).toISOString();
};

export const normalizeMeetingListingRows = (
  rows: ParsedMeetingListingRow[],
): {
  meetings: NormalizedMeetingListingRow[];
  errors: MeetingListingNormalizationError[];
} => {
  const meetings: NormalizedMeetingListingRow[] = [];
  const errors: MeetingListingNormalizationError[] = [];
  const seen = new Set<string>();

  rows.forEach((row) => {
    const date = parseListingDate(normalizeWhitespace(row.dateText));
    const title = normalizeWhitespace(row.titleText);
    const type = normalizeWhitespace(row.typeText);
    const simbliId = normalizeWhitespace(row.simbliId);
    const simbliSiteId = normalizeWhitespace(row.simbliSiteId) || "200015";
    const sourceUrl = normalizeWhitespace(row.sourceUrl);

    if (!simbliId) {
      errors.push({ rowIndex: row.rowIndex, reason: "Missing MID" });
      return;
    }
    if (seen.has(simbliId)) {
      errors.push({ rowIndex: row.rowIndex, reason: "Duplicate MID in listing", simbliId });
      return;
    }
    if (!date) {
      errors.push({ rowIndex: row.rowIndex, reason: "Unparseable meeting date", simbliId });
      return;
    }
    if (!title || !type || !sourceUrl) {
      errors.push({ rowIndex: row.rowIndex, reason: "Missing required listing fields", simbliId });
      return;
    }

    seen.add(simbliId);
    meetings.push({
      simbliSiteId,
      simbliId,
      date,
      title,
      type,
      sourceUrl,
      minutesUrl: row.minutesUrl ?? null,
      minutesText: normalizeWhitespace(row.minutesText),
      rawDateText: normalizeWhitespace(row.dateText),
    });
  });

  return { meetings, errors };
};
