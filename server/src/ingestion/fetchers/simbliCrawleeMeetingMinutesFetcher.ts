import { PlaywrightCrawler } from "crawlee";
import { chromium } from "playwright";
import { parseMeetingMinutesResponse, type MeetingMinutesResponse } from "../parsers/meetingMinutesParser";

export type CrawleeMeetingTarget = {
  meetingId: number;
  simbliId: string;
  title: string;
  date: string;
  type: string;
  sourceUrl: string;
  siteId?: string;
};

export type CrawleeMeetingMinutesSuccess = {
  meeting: CrawleeMeetingTarget;
  pageUrl: string;
  pageTitle: string;
  minutesRequestUrl: string;
  minutesTabUrl: string;
  response: MeetingMinutesResponse;
};

export type CrawleeMeetingMinutesFailure = {
  meeting: CrawleeMeetingTarget;
  reason: string;
};

export type CrawleeMeetingMinutesBatchResult = {
  successes: CrawleeMeetingMinutesSuccess[];
  failures: CrawleeMeetingMinutesFailure[];
};

type FetchOptions = {
  requestTimeoutMs?: number;
  settleMs?: number;
};

const defaultOptions: Required<FetchOptions> = {
  requestTimeoutMs: 120_000,
  settleMs: 5_000,
};

const chromeExecutablePath = process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/google-chrome";

export const fetchMeetingMinutesWithCrawlee = async (
  meetings: CrawleeMeetingTarget[],
  options: FetchOptions = {},
): Promise<CrawleeMeetingMinutesBatchResult> => {
  if (!process.env.DISPLAY) {
    throw new Error(
      "DISPLAY is required for the Crawlee Playwright lane because headless Simbli meeting loads hit the Incapsula challenge shell.",
    );
  }

  const { requestTimeoutMs, settleMs } = { ...defaultOptions, ...options };
  const successes: CrawleeMeetingMinutesSuccess[] = [];
  const failures: CrawleeMeetingMinutesFailure[] = [];

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 0,
    requestHandlerTimeoutSecs: Math.ceil(requestTimeoutMs / 1000) + 15,
    navigationTimeoutSecs: Math.ceil(requestTimeoutMs / 1000),
    launchContext: {
      launcher: chromium,
      launchOptions: {
        executablePath: chromeExecutablePath,
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
      },
    },
    async requestHandler({ page, request }) {
      const meeting = request.userData.meeting as CrawleeMeetingTarget;
      await page.waitForLoadState("load");
      await page.waitForTimeout(settleMs);
      await page.waitForSelector("button#meeting-tab-minutes", { timeout: 15_000 });

      const shellText = await page.locator("body").innerText().catch(() => "");
      if (/_Incapsula_Resource|Request unsuccessful\. Incapsula incident ID/i.test(shellText)) {
        throw new Error(`Incapsula challenge shell blocked meeting ${meeting.simbliId}`);
      }

      const browserResult = await page.evaluate(async () => {
        const runtime = window as typeof window & {
          sToken?: string;
          enDID?: string;
          enMeetingID?: string;
          enCuUID?: string;
          siteId?: string;
        };

        const sToken = runtime.sToken ?? "";
        const enDID = runtime.enDID ?? "";
        const enMeetingID = runtime.enMeetingID ?? "";
        const enCuUID = runtime.enCuUID ?? "";
        const siteId = runtime.siteId ?? "200015";
        const match = location.search.match(/MID=([^&]+)/);
        const meetingId = match?.[1] ?? "";

        if (!sToken || !enDID || !enMeetingID || !meetingId) {
          return {
            pageUrl: location.href,
            pageTitle: document.title,
            error: "Meeting page did not expose Simbli hydration tokens",
          };
        }

        const requestPath = `/Services/api/GetMeetingMinutes/?sct=${sToken}&endid=${enDID}&enmid=${enMeetingID}&enuid=${enCuUID}&enajs=&searchText=&matchType=`;
        const response = await fetch(requestPath, { credentials: "include" });
        const text = await response.text();

        return {
          pageUrl: location.href,
          pageTitle: document.title,
          requestUrl: new URL(requestPath, location.origin).toString(),
          minutesTabUrl: `${location.origin}/SB_Meetings/ViewMeeting.aspx?S=${siteId}&MID=${meetingId}&Tab=Minutes`,
          status: response.status,
          text,
        };
      });

      if (browserResult.error) {
        throw new Error(`${browserResult.error} for meeting ${meeting.simbliId}`);
      }

      if (browserResult.status !== 200) {
        throw new Error(
          `GetMeetingMinutes returned ${browserResult.status} for meeting ${meeting.simbliId}`,
        );
      }

      successes.push({
        meeting,
        pageUrl: browserResult.pageUrl,
        pageTitle: browserResult.pageTitle,
        minutesRequestUrl: browserResult.requestUrl,
        minutesTabUrl: browserResult.minutesTabUrl,
        response: parseMeetingMinutesResponse(browserResult.text),
      });
    },
    failedRequestHandler({ request, error }) {
      failures.push({
        meeting: request.userData.meeting as CrawleeMeetingTarget,
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  });

  await crawler.run(
    meetings.map((meeting) => ({
      url: meeting.sourceUrl,
      uniqueKey: meeting.simbliId,
      userData: { meeting },
    })),
  );

  return { successes, failures };
};
