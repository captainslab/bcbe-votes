import axios from "axios";
import { withRetry } from "../../utils/retry";

const SITE_ID = "200015";
const SEARCH_URL = `https://simbli.eboardsolutions.com/Search/ShowSearchResults.aspx?S=${SITE_ID}`;

type ChromeTarget = {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
};

type CdpMessage =
  | { id: number; method: string; params?: Record<string, unknown> }
  | { method: string; params: Record<string, unknown> };

type CapturedEvent = {
  type: "request" | "response";
  url: string;
  requestId: string;
  method?: string;
  postData?: string | null;
  status?: number;
  body?: string;
};

export type SearchBrowserRun = {
  searchUrl: string;
  searchRequestBody: string;
  searchResponseText: string;
  searchRequestUrl: string;
  searchedMeetingDataUrl: string;
  searchedMeetingDataText: string;
};

type SearchBrowserOptions = {
  query?: string;
  timeoutMs?: number;
  remoteDebugPort?: number;
};

const defaultOptions: Required<SearchBrowserOptions> = {
  query: "board",
  timeoutMs: 60_000,
  remoteDebugPort: 9222,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBrowserTargets = async (port: number) => {
  const response = await axios.get<ChromeTarget[]>(`http://127.0.0.1:${port}/json/list`, {
    timeout: 5_000,
  });
  return response.data;
};

const openSearchTarget = async (port: number, url: string) => {
  const targets = await withRetry(() => getBrowserTargets(port), {
    attempts: 3,
    delayMs: 500,
  });

  const existing = targets.find((target) => target.url.includes("/Search/ShowSearchResults.aspx"));
  if (existing?.webSocketDebuggerUrl) {
    return existing.webSocketDebuggerUrl;
  }

  const created = await axios.get<ChromeTarget>(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    timeout: 10_000,
  });

  if (!created.data.webSocketDebuggerUrl) {
    throw new Error("Chrome did not expose a debugger websocket for the search tab");
  }

  return created.data.webSocketDebuggerUrl;
};

const createCdpSession = async (webSocketDebuggerUrl: string) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason: unknown) => void;
    }
  >();
  const listeners = new Map<string, ((params: Record<string, unknown>) => void)[]>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as CdpMessage & { id?: number };
    if ("id" in message && typeof message.id === "number") {
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      const error = (message as { error?: { message?: string } }).error;
      if (error) {
        handler.reject(new Error(String(error.message ?? "CDP request failed")));
        return;
      }
      handler.resolve((message as { result?: unknown }).result);
      return;
    }

    if ("method" in message) {
      const handlers = listeners.get(message.method) ?? [];
      handlers.forEach((handler) => handler((message.params ?? {}) as Record<string, unknown>));
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("Unable to connect to Chrome remote debugger")));
  });

  const send = async <T = unknown>(method: string, params: Record<string, unknown> = {}) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const on = (method: string, handler: (params: Record<string, unknown>) => void) => {
    const existing = listeners.get(method) ?? [];
    existing.push(handler);
    listeners.set(method, existing);
  };

  return { socket, send, on };
};

const waitFor = async (
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  pollMs = 250,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await wait(pollMs);
  }
  throw new Error("Timed out waiting for Simbli search page");
};

const clickSearchPopup = async (
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>,
  searchText: string,
) => {
  await send("Runtime.evaluate", {
    expression: `document.getElementById('topSearchButton')?.click()`,
  });
  await wait(1_000);

  await send("Runtime.evaluate", {
    expression: `(() => {
      const popup = document.querySelector('#dvMySearchPopup');
      const input = popup?.querySelector('input[placeholder="Enter your search keyword here"]');
      if (!input) throw new Error('Simbli search input not found');
      input.focus();
      input.value = ${JSON.stringify(searchText)};
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(searchText)}, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const meetingToggle = popup?.querySelector('#meetingToggle');
      if (meetingToggle && 'checked' in meetingToggle && !meetingToggle.checked) meetingToggle.click();
    })()`,
  });

  await waitFor(async () => {
    const result = await send<{ result: { value: boolean } }>("Runtime.evaluate", {
      expression: `(() => {
        const popup = document.querySelector('#dvMySearchPopup');
        const button = popup ? [...popup.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Search') : null;
        return Boolean(button && !button.hasAttribute('disabled') && !button.disabled);
      })()`,
      returnByValue: true,
    });
    return Boolean(result.result.value);
  }, 10_000);

  await send("Runtime.evaluate", {
    expression: `(() => {
      const popup = document.querySelector('#dvMySearchPopup');
      const button = popup ? [...popup.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Search') : null;
      if (!button) throw new Error('Simbli search button not found');
      button.click();
    })()`,
  });
};

const getResponseBody = async (
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>,
  requestId: string,
) => {
  const body = await send<{ body: string }>("Network.getResponseBody", { requestId });
  return body.body;
};

export const fetchSimbliSearchFlow = async (options: SearchBrowserOptions = {}): Promise<SearchBrowserRun> => {
  const { query, timeoutMs, remoteDebugPort } = { ...defaultOptions, ...options };
  const searchUrl = SEARCH_URL;
  const webSocketDebuggerUrl = await openSearchTarget(remoteDebugPort, searchUrl);
  const { socket, send, on } = await createCdpSession(webSocketDebuggerUrl);

  const events: CapturedEvent[] = [];
  const recordEvent = (type: "request" | "response") => (params: Record<string, unknown>) => {
    const request = params.request as
      | { url?: string; method?: string; postData?: string }
      | undefined;
    const response = params.response as { url?: string; status?: number } | undefined;
    const url = request?.url ?? response?.url;
    if (
      !url ||
      (!url.includes("SessionIdentifier.ashx") &&
        !url.includes("SearchMeetingModule") &&
        !url.includes("GetSearchedMeetingData"))
    ) {
      return;
    }

    const capturedEvent: CapturedEvent = {
      type,
      url,
      requestId: String(params.requestId ?? ""),
      postData: request?.postData ?? null,
    };
    if (request?.method) capturedEvent.method = request.method;
    if (response?.status) capturedEvent.status = response.status;
    events.push(capturedEvent);
  };

  on("Network.requestWillBeSent", recordEvent("request"));
  on("Network.responseReceived", recordEvent("response"));

  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");

    await send("Page.navigate", { url: searchUrl });
    await waitFor(async () => {
      const result = await send<{ result: { value: string } }>("Runtime.evaluate", {
        expression: "document.title",
        returnByValue: true,
      });
      return result.result.value === "Search Result";
    }, timeoutMs);

    await clickSearchPopup(send, query);
    await wait(8_000);

    const searchResponses = events.filter(
      (event) => event.type === "response" && event.url.includes("SearchMeetingModule"),
    );
    const searchResponse = searchResponses[searchResponses.length - 1];
    if (!searchResponse?.requestId) {
      throw new Error("SearchMeetingModule response was not captured");
    }

    const searchRequest = events
      .filter((event) => event.type === "request" && event.url.includes("SearchMeetingModule"))
      .slice(-1)[0];

    if (!searchRequest?.postData) {
      throw new Error("SearchMeetingModule request body was not captured");
    }

    const searchResponseText = await getResponseBody(send, searchResponse.requestId);
    const searchResponseJson = JSON.parse(searchResponseText) as {
      meetingSearchResponseDTOs?: Array<{ AgendaId?: string; AgendaTitle?: string | null }>;
    };

    const agendaRow = searchResponseJson.meetingSearchResponseDTOs?.find(
      (row) => Boolean(row?.AgendaId) && (row?.AgendaTitle ?? "") === "Board View",
    ) ?? searchResponseJson.meetingSearchResponseDTOs?.find((row) => Boolean(row?.AgendaId));

    if (!agendaRow?.AgendaId) {
      throw new Error("No agenda row was returned from SearchMeetingModule");
    }

    const requestBody = JSON.parse(searchRequest.postData) as {
      CacheKey?: string;
    };
    const cacheKey = requestBody.CacheKey ?? "";
    if (!cacheKey) {
      throw new Error("Search request did not include a cache key");
    }

    await send("Runtime.evaluate", {
      expression: `(() => {
        const target = [...document.querySelectorAll('a,button,div,span')].find((el) => (el.textContent || '').trim() === 'Board View');
        if (!target) throw new Error('Searched meeting item not found');
        target.click();
      })()`,
    });
    await wait(8_000);

    const meetingDataResponses = events.filter(
      (event) => event.type === "response" && event.url.includes("GetSearchedMeetingData"),
    );
    const meetingDataResponse = meetingDataResponses[meetingDataResponses.length - 1];
    if (!meetingDataResponse?.requestId) {
      throw new Error("GetSearchedMeetingData response was not captured");
    }

    const searchedMeetingDataText = await getResponseBody(send, meetingDataResponse.requestId);
    if (!searchedMeetingDataText) throw new Error("GetSearchedMeetingData returned an empty response");

    return {
      searchUrl,
      searchRequestUrl: "https://simbli.eboardsolutions.com/CoreServices/api/Search/SearchMeetingModule",
      searchRequestBody: searchRequest.postData,
      searchResponseText,
      searchedMeetingDataUrl: meetingDataResponse.url,
      searchedMeetingDataText,
    };
  } finally {
    socket.close();
  }
};
