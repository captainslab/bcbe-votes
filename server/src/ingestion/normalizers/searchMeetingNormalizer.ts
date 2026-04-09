import { normalizeWhitespace } from "../../utils/text";
import type {
  SearchMeetingModuleRow,
  SearchedMeetingDataMeetingRow,
  SearchedMeetingDataResponse,
  SearchedMeetingTypeRow,
} from "../parsers/searchMeetingParser";

export type NormalizedSearchMeetingRow = {
  meetingId: string;
  agendaId: string;
  meetingDate: string;
  meetingTitle: string;
  agendaTitle: string | null;
  meetingTypeName: string;
  siteId: number;
  enSiteId: string;
  existInAgenda: boolean;
  existInMinutes: boolean;
  sourceType: string;
};

export type NormalizedSearchedMeetingRow = {
  simbliId: string;
  agendaId: string;
  date: string;
  title: string;
  type: string;
  siteId: number;
  simbliSiteId: string;
  sourceUrl: string;
  minutesUrl: string | null;
  existInAgenda: boolean;
  existInMinutes: boolean;
  meetingTypeId: number;
  meetingTypeName: string;
};

export type SearchNormalizationError = {
  rowIndex?: number;
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

const parseCentralDateTime = (value: string) => {
  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i,
  );
  if (!match) return null;

  const [, monthText, dayText, yearText, hourText, minuteText, secondText, periodText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  let hour = Number(hourText) % 12;
  if ((periodText ?? "").toUpperCase() === "PM") hour += 12;
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetMinutes = getCentralOffsetMinutes(year, month, day, hour);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(utcMillis).toISOString();
};

const splitMeetingName = (name: string) => {
  const raw = normalizeWhitespace(name);
  const dividerIndex = raw.lastIndexOf("|");
  if (dividerIndex < 0) {
    return {
      title: raw,
      dateText: "",
    };
  }

  return {
    title: normalizeWhitespace(raw.slice(0, dividerIndex)),
    dateText: normalizeWhitespace(raw.slice(dividerIndex + 1)),
  };
};

const buildSourceUrl = (siteId: number, meetingId: number) =>
  `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=${siteId}&MID=${meetingId}`;

const normalizeMeetingType = (
  meetingTypeId: number,
  meetingTypes: SearchedMeetingTypeRow[],
  fallbackTitle: string,
) => {
  const match = meetingTypes.find((type) => type.MtId === meetingTypeId);
  return normalizeWhitespace(match?.Name) || fallbackTitle;
};

export const normalizeSearchMeetingRows = (rows: SearchMeetingModuleRow[]): {
  meetings: NormalizedSearchMeetingRow[];
  errors: SearchNormalizationError[];
} => {
  const meetings: NormalizedSearchMeetingRow[] = [];
  const errors: SearchNormalizationError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const meetingId = normalizeWhitespace(row.MeetingId);
    const agendaId = normalizeWhitespace(row.AgendaId);
    if (!meetingId || !agendaId) {
      const error: SearchNormalizationError = {
        rowIndex,
        reason: "Missing meeting or agenda id",
      };
      if (meetingId) error.simbliId = meetingId;
      errors.push(error);
      return;
    }

    if (seen.has(`${meetingId}:${agendaId}`)) return;
    seen.add(`${meetingId}:${agendaId}`);

    meetings.push({
      meetingId,
      agendaId,
      meetingDate: new Date(row.MeetingDate).toISOString(),
      meetingTitle: normalizeWhitespace(row.MeetingTitle),
      agendaTitle: row.AgendaTitle ? normalizeWhitespace(row.AgendaTitle) : null,
      meetingTypeName: normalizeWhitespace(row.MeetingTypeName),
      siteId: row.SiteId,
      enSiteId: normalizeWhitespace(row.EnSiteId),
      existInAgenda: row.ExistInAgenda,
      existInMinutes: row.ExistInMinutes,
      sourceType: normalizeWhitespace(row.SourceType),
    });
  });

  return { meetings, errors };
};

export const normalizeSearchedMeetingData = (
  response: SearchedMeetingDataResponse,
): {
  meetings: NormalizedSearchedMeetingRow[];
  errors: SearchNormalizationError[];
} => {
  const meetings: NormalizedSearchedMeetingRow[] = [];
  const errors: SearchNormalizationError[] = [];
  const seen = new Set<string>();

  response.MeetingList.forEach((row: SearchedMeetingDataMeetingRow, rowIndex: number) => {
    const simbliId = Number(row.Id);
    if (!Number.isFinite(simbliId)) {
      errors.push({ rowIndex, reason: "Invalid meeting id", simbliId: String(row.Id) });
      return;
    }

    if (seen.has(String(simbliId))) return;
    seen.add(String(simbliId));

    const { title, dateText } = splitMeetingName(row.Name);
    const date = parseCentralDateTime(dateText);
    if (!date) {
      errors.push({ rowIndex, reason: "Unparseable meeting date", simbliId: String(simbliId) });
      return;
    }

    const meetingTypeName = normalizeMeetingType(row.MtId, response.MeetingTypeList, title);
    meetings.push({
      simbliId: String(simbliId),
      agendaId: normalizeWhitespace(row.AId),
      date,
      title,
      type: meetingTypeName,
      siteId: row.SiteId,
      simbliSiteId: String(row.SiteId),
      sourceUrl: buildSourceUrl(row.SiteId, simbliId),
      minutesUrl: null,
      existInAgenda: row.ExistInAgenda,
      existInMinutes: row.ExistInMinutes,
      meetingTypeId: row.MtId,
      meetingTypeName,
    });
  });

  return { meetings, errors };
};
