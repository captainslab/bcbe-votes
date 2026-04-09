import axios from "axios";
import { withRetry } from "../../utils/retry";

const BASE_URL = "https://simbli.eboardsolutions.com/SB_Meetings";
const browserHeaders = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://simbli.eboardsolutions.com/",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

type FetchOptions = {
  siteId?: string;
  timeoutMs?: number;
};

const defaultOptions: Required<FetchOptions> = {
  siteId: "200015",
  timeoutMs: 15000,
};

export const fetchMeetingListing = async (options: FetchOptions = {}) => {
  const { siteId, timeoutMs } = { ...defaultOptions, ...options };
  const url = `${BASE_URL}/SB_MeetingListing.aspx?S=${siteId}`;

  const response = await withRetry(
    () =>
      axios.get<string>(url, {
        timeout: timeoutMs,
        headers: browserHeaders,
      }),
    { attempts: 4, delayMs: 750 },
  );

  return response.data;
};

export const fetchMeetingDetail = async (meetingId: string, options: FetchOptions = {}) => {
  const { siteId, timeoutMs } = { ...defaultOptions, ...options };
  const url = `${BASE_URL}/ViewMeeting.aspx?S=${siteId}&MID=${meetingId}`;

  const response = await withRetry(
    () =>
      axios.get<string>(url, {
        timeout: timeoutMs,
        headers: browserHeaders,
      }),
    { attempts: 4, delayMs: 750 },
  );

  return { html: response.data, sourceUrl: url };
};
