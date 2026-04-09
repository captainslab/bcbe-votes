import axios from "axios";
import { withRetry } from "../../utils/retry";

const BASE_URL = "https://simbli.eboardsolutions.com/SB_Meetings";

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
    () => axios.get<string>(url, { timeout: timeoutMs }),
    { attempts: 4, delayMs: 750 },
  );

  return response.data;
};

export const fetchMeetingDetail = async (meetingId: string, options: FetchOptions = {}) => {
  const { siteId, timeoutMs } = { ...defaultOptions, ...options };
  const url = `${BASE_URL}/ViewMeeting.aspx?S=${siteId}&MID=${meetingId}`;

  const response = await withRetry(
    () => axios.get<string>(url, { timeout: timeoutMs }),
    { attempts: 4, delayMs: 750 },
  );

  return { html: response.data, sourceUrl: url };
};
