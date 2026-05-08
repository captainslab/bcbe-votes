import { FirecrawlAppV1 as FirecrawlApp } from "@mendable/firecrawl-js";
import { parseMeetingMinutesResponse, type MeetingMinutesResponse } from "../parsers/meetingMinutesParser";

export type MeetingTarget = {
  meetingId: number;
  simbliId: string;
  title: string;
  date: string;
  type: string;
  sourceUrl: string;
  siteId?: string;
};

export type MeetingMinutesSuccess = {
  meeting: MeetingTarget;
  pageUrl: string;
  pageTitle: string;
  minutesRequestUrl: string;
  minutesTabUrl: string;
  response: MeetingMinutesResponse;
};

export type MeetingMinutesFailure = {
  meeting: MeetingTarget;
  reason: string;
};

export type MeetingMinutesBatchResult = {
  successes: MeetingMinutesSuccess[];
  failures: MeetingMinutesFailure[];
};

type ScriptResult = {
  pageUrl: string;
  pageTitle: string;
  requestUrl: string;
  minutesTabUrl: string;
  status: number;
  text: string;
  error?: never;
} | {
  error: string;
  sToken?: boolean;
  enDID?: boolean;
  enMeetingID?: boolean;
};

const EXTRACT_AND_FETCH_MINUTES = `
(async () => {
  const sToken = window.sToken ?? "";
  const enDID = window.enDID ?? "";
  const enMeetingID = window.enMeetingID ?? "";
  const enCuUID = window.enCuUID ?? "";
  const siteId = window.siteId ?? "200015";
  const match = location.search.match(/MID=([^&]+)/);
  const meetingId = match ? match[1] : "";

  if (!sToken || !enDID || !enMeetingID || !meetingId) {
    return { error: "Missing hydration tokens", sToken: !!sToken, enDID: !!enDID, enMeetingID: !!enMeetingID };
  }

  const requestPath = "/Services/api/GetMeetingMinutes/?sct=" + sToken + "&endid=" + enDID + "&enmid=" + enMeetingID + "&enuid=" + enCuUID + "&enajs=&searchText=&matchType=";
  const response = await fetch(requestPath, { credentials: "include" });
  const text = await response.text();

  return {
    pageUrl: location.href,
    pageTitle: document.title,
    requestUrl: new URL(requestPath, location.origin).toString(),
    minutesTabUrl: location.origin + "/SB_Meetings/ViewMeeting.aspx?S=" + siteId + "&MID=" + meetingId + "&Tab=Minutes",
    status: response.status,
    text
  };
})()
`;

export const fetchMeetingMinutesWithFirecrawl = async (
  meetings: MeetingTarget[],
): Promise<MeetingMinutesBatchResult> => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required");

  const firecrawl = new FirecrawlApp({ apiKey });
  const successes: MeetingMinutesSuccess[] = [];
  const failures: MeetingMinutesFailure[] = [];

  for (const meeting of meetings) {
    try {
      const result = await firecrawl.scrapeUrl(meeting.sourceUrl, {
        formats: [],
        actions: [
          { type: "wait", milliseconds: 5000 },
          { type: "executeJavascript", script: EXTRACT_AND_FETCH_MINUTES },
        ],
      });

      if (!result.success) {
        throw new Error(`Firecrawl scrape failed for meeting ${meeting.simbliId}: ${(result as { error?: string }).error ?? "unknown"}`);
      }

      const scriptReturn = (result as { actions?: { javascriptReturns?: Array<{ value: unknown }> } })
        .actions?.javascriptReturns?.[0]?.value as ScriptResult | undefined;

      if (!scriptReturn) {
        throw new Error(`No script return for meeting ${meeting.simbliId}`);
      }

      if ("error" in scriptReturn && scriptReturn.error) {
        throw new Error(`Hydration token error for meeting ${meeting.simbliId}: ${scriptReturn.error}`);
      }

      const data = scriptReturn as Exclude<ScriptResult, { error: string }>;

      if (data.status !== 200) {
        throw new Error(`GetMeetingMinutes returned HTTP ${data.status} for meeting ${meeting.simbliId}`);
      }

      successes.push({
        meeting,
        pageUrl: data.pageUrl,
        pageTitle: data.pageTitle,
        minutesRequestUrl: data.requestUrl,
        minutesTabUrl: data.minutesTabUrl,
        response: parseMeetingMinutesResponse(data.text),
      });
    } catch (error) {
      failures.push({
        meeting,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { successes, failures };
};
