import axios from "axios";
import { withRetry } from "../../utils/retry";

const SEARCH_URL = "https://simbli.eboardsolutions.com/Search/ShowSearchResults.aspx?S=200015";

type ChromeTarget = {
  title?: string;
  url: string;
  webSocketDebuggerUrl: string;
};

type FetchAgendaOptions = {
  agendaId: string;
  enSiteId: string;
  meetingId?: number;
  remoteDebugPort?: number;
  timeoutMs?: number;
};

type AgendaProbeBrowserState = {
  href: string;
  title: string;
  sToken: string | null;
  currUserId: string | null;
  enDID: string | null;
  siteId: string | null;
};

type AgendaProbePayload = {
  path: string;
  status: number;
  text: string;
};

const getTargets = async (port: number) => {
  const response = await axios.get<ChromeTarget[]>(`http://127.0.0.1:${port}/json/list`, {
    timeout: 5000,
  });
  return response.data;
};

const openSearchTarget = async (port: number) => {
  const targets = await withRetry(() => getTargets(port), {
    attempts: 3,
    delayMs: 500,
  });
  const existing =
    targets.find(
      (target) =>
        target.title === "Search Result" &&
        target.url.includes("/Search/ShowSearchResults.aspx"),
    ) ?? targets.find((target) => target.url.includes("/Search/ShowSearchResults.aspx"));
  if (existing?.webSocketDebuggerUrl) return existing.webSocketDebuggerUrl;

  const created = await axios.put<ChromeTarget>(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(SEARCH_URL)}`, undefined, {
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
  const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: unknown) => void }>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data as string) as { id?: number; result?: unknown; error?: { message?: string } };
    if (typeof message.id !== "number") return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) {
      handler.reject(new Error(String(message.error.message ?? "CDP request failed")));
      return;
    }
    handler.resolve(message.result);
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

  return { socket, send };
};

export const fetchCompleteAgendaItem = async (options: FetchAgendaOptions) => {
  const { agendaId, enSiteId, remoteDebugPort = 9222 } = options;
  const webSocketDebuggerUrl = await openSearchTarget(remoteDebugPort);
  const { socket, send } = await createCdpSession(webSocketDebuggerUrl);

  try {
    await send("Runtime.enable");
    const response = await send<{ result: { value: { state: AgendaProbeBrowserState; payload: AgendaProbePayload | null } } }>(
      "Runtime.evaluate",
      {
        expression: `Promise.resolve().then(async () => {
          const state = {
            href: location.href,
            title: document.title,
            sToken: window.sToken || null,
            currUserId: window.currUserId || null,
            enDID: window.enDID || null,
            siteId: window.siteId || null
          };
          const requests = [
            '/Services/api/GetCompleteAgendaItem_V1/?sct=' + (window.sToken || '') + '&sid=' + ${JSON.stringify(enSiteId)} + '&iid=' + ${JSON.stringify(agendaId)} + '&uid=' + (window.currUserId || ''),
            '/CoreServices/api/MeetingAgenda/GetMeetingItemDetails/?sct=' + (window.sToken || '') + '&sid=' + ${JSON.stringify(enSiteId)} + '&iid=' + ${JSON.stringify(agendaId)} + '&uid=' + (window.currUserId || '')
          ];
          for (const path of requests) {
            const r = await fetch(path, { credentials: 'include' });
            const text = await r.text();
            if (r.ok && text && text.trim()) {
              return { state, payload: { path, status: r.status, text } };
            }
          }
          return { state, payload: null };
        })`,
        awaitPromise: true,
        returnByValue: true,
      },
    );

    const state = response.result.value.state;
    const payload = response.result.value.payload;

    if (!payload?.text) {
      throw new Error("Agenda item loader returned no content from the hydrated search page");
    }

    return {
      url: `https://simbli.eboardsolutions.com${payload.path}`,
      requestPath: payload.path,
      status: payload.status,
      text: payload.text,
      state,
    };
  } finally {
    socket.close();
  }
};
