import axios from "axios";
import { useEffect, useState } from "react";
import { api, setAdminAuth } from "../api/client";

// ── Types ────────────────────────────────────────────────────────────────────

type ImportLog = {
  id: number;
  type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  meetings_processed: number | null;
  votes_created: number | null;
  records_flagged: number | null;
  error_summary: string | null;
};

type ImportResponse = {
  status: string;
  processed?: number;
  votesCreated?: number;
  recordsFlagged?: number;
  replayed?: number;
  errors?: number;
};

type OpStatus =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_KEY = "admin_auth";

function saveCredentials(user: string, pass: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, pass }));
}

function loadCredentials(): { user: string; pass: string } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { user: "", pass: "" };
}

function axiosErrMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 401) return "Unauthorized — check credentials";
    if (err.response?.status === 503) return "Admin access is not configured on the server";
    const data = err.response?.data;
    if (typeof data === "object" && data && "error" in data) return String(data.error);
  }
  return fallback;
}

function fmt(val: number | null | undefined): string {
  return val != null ? String(val) : "—";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
  if (status === "success") return <span className={`${base} bg-emerald-100 text-emerald-800`}>success</span>;
  if (status === "error") return <span className={`${base} bg-red-100 text-red-800`}>error</span>;
  if (status === "running") return <span className={`${base} bg-blue-100 text-blue-800`}>running</span>;
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status}</span>;
}

function OpBanner({ status }: { status: OpStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "loading")
    return (
      <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        {status.label}…
      </div>
    );
  if (status.kind === "success")
    return <div className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white">{status.message}</div>;
  return <div className="rounded-lg bg-red-700 px-4 py-3 text-sm font-medium text-white">{status.message}</div>;
}

// ── Main component ───────────────────────────────────────────────────────────

export const Admin = () => {
  const saved = loadCredentials();

  // credentials
  const [user, setUser] = useState(saved.user);
  const [pass, setPass] = useState(saved.pass);

  // import controls — stage 1 & 2 share the MID range inputs
  const [startMid, setStartMid] = useState("");
  const [endMid, setEndMid] = useState("");
  const [replayLimit, setReplayLimit] = useState(10);
  const [simbliId, setSimbliId] = useState("");

  // logs
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // operation feedback
  const [opStatus, setOpStatus] = useState<OpStatus>({ kind: "idle" });

  // ── auth helper ─────────────────────────────────────────────────────────

  function applyAuth() {
    setAdminAuth(user, pass);
    saveCredentials(user, pass);
  }

  // ── load logs ───────────────────────────────────────────────────────────

  async function fetchLogs() {
    if (!user || !pass) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      applyAuth();
      const res = await api.get<ImportLog[]>("/admin/import-logs");
      setLogs(res.data);
    } catch (err) {
      setLogsError(axiosErrMsg(err, "Failed to load import logs"));
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (saved.user && saved.pass) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── import actions ───────────────────────────────────────────────────────

  async function runImport(label: string, fn: () => Promise<ImportResponse>) {
    setOpStatus({ kind: "loading", label });
    try {
      applyAuth();
      const data = await fn();
      const parts: string[] = [`${label} complete.`];
      if (data.processed != null) parts.push(`Processed: ${data.processed}`);
      if (data.votesCreated != null) parts.push(`Votes created: ${data.votesCreated}`);
      if (data.recordsFlagged != null) parts.push(`Flagged: ${data.recordsFlagged}`);
      if (data.replayed != null) parts.push(`Replayed: ${data.replayed}`);
      if (data.errors != null) parts.push(`Errors: ${data.errors}`);
      setOpStatus({ kind: "success", message: parts.join("  ·  ") });
      fetchLogs();
    } catch (err) {
      setOpStatus({ kind: "error", message: axiosErrMsg(err, `${label} failed`) });
    }
  }

  const handleBatchFetch = () =>
    runImport("Stage 1 — batch fetch", async () => {
      const res = await api.post<ImportResponse>("/admin/batch-fetch", {
        startMid: startMid ? Number(startMid) : undefined,
        endMid: endMid ? Number(endMid) : undefined,
      });
      return res.data;
    });

  const handleBatchDetail = () =>
    runImport("Stage 2 — batch detail import", async () => {
      const res = await api.post<ImportResponse>("/admin/batch-detail-import", {
        startMid: startMid ? Number(startMid) : undefined,
        endMid: endMid ? Number(endMid) : undefined,
      });
      return res.data;
    });

  const handleSessionReplay = () =>
    runImport("Stage 3 — session replay", async () => {
      const res = await api.post<ImportResponse>("/admin/batch-session-replay", {
        limit: replayLimit,
      });
      return res.data;
    });

  const handleSingle = () =>
    runImport("Single meeting import", async () => {
      const res = await api.post<ImportResponse>(`/admin/import-meeting/${simbliId}`);
      return res.data ?? { status: "ok" };
    });

  const busy = opStatus.kind === "loading";

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin Controls</h1>
        <p className="text-sm text-slate-600">
          Imports are automated and idempotent. Provide MID ranges to refresh data from Simbli.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Admin routes are protected with HTTP Basic Auth. Credentials are stored in sessionStorage
        only and cleared when the tab closes.
      </div>

      {/* ── Credentials ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Credentials</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Username
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={user}
              placeholder="Admin username"
              autoComplete="username"
              onChange={(e) => setUser(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={pass}
              type="password"
              autoComplete="current-password"
              placeholder="Admin password"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
        </div>
        <button
          onClick={fetchLogs}
          disabled={!user || !pass || logsLoading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
        >
          Save &amp; verify credentials
        </button>
      </section>

      {/* ── Import logs ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import logs</h2>
            <p className="text-xs text-slate-500">Last 50 entries</p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={logsLoading || !user || !pass}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40"
          >
            {logsLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {logsError && (
          <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{logsError}</div>
        )}

        {!logsError && logs.length === 0 && !logsLoading && (
          <div className="px-5 py-6 text-sm text-slate-400 text-center">
            {user && pass ? "No logs found." : "Enter credentials above to load logs."}
          </div>
        )}

        {logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3 text-right">Processed</th>
                  <th className="px-4 py-3 text-right">Votes</th>
                  <th className="px-4 py-3 text-right">Flagged</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{log.type}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(log.started_at)}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(log.completed_at)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmt(log.meetings_processed)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmt(log.votes_created)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmt(log.records_flagged)}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={log.error_summary ?? undefined}>
                      {log.error_summary ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Import controls ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Import controls</h2>

        {/* Shared MID range */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            MID range (Stage 1 &amp; 2)
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <label className="block text-sm text-slate-700">
              Start MID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={startMid}
                placeholder="e.g. 4000"
                onChange={(e) => setStartMid(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              End MID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={endMid}
                placeholder="e.g. 4200"
                onChange={(e) => setEndMid(e.target.value)}
              />
            </label>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Stage 1 */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Stage 1 — Batch fetch</p>
            <p className="text-xs text-slate-500">
              Fetches the Simbli meeting listing and upserts meeting stubs within the MID range.
            </p>
          </div>
          <button
            onClick={handleBatchFetch}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
          >
            Run Stage 1
          </button>
        </div>

        <hr className="border-slate-100" />

        {/* Stage 2 */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Stage 2 — Batch detail import</p>
            <p className="text-xs text-slate-500">
              Downloads agenda/minutes HTML for each stub and extracts vote items and records.
            </p>
          </div>
          <button
            onClick={handleBatchDetail}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
          >
            Run Stage 2
          </button>
        </div>

        <hr className="border-slate-100" />

        {/* Stage 3 */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Stage 3 — Session replay</p>
            <p className="text-xs text-slate-500">
              Fallback re-import for meetings that failed detail extraction. Limit: 1–25.
            </p>
          </div>
          <div className="flex items-center gap-4 max-w-xs">
            <label className="text-sm text-slate-700 shrink-0">
              Limit
            </label>
            <input
              type="range"
              min={1}
              max={25}
              value={replayLimit}
              onChange={(e) => setReplayLimit(Number(e.target.value))}
              className="flex-1 accent-slate-900"
            />
            <span className="w-6 text-sm font-semibold text-slate-800 text-right">{replayLimit}</span>
          </div>
          <button
            onClick={handleSessionReplay}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
          >
            Run Stage 3
          </button>
        </div>

        <hr className="border-slate-100" />

        {/* Single meeting */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Single meeting import</p>
            <p className="text-xs text-slate-500">
              Import or re-import one meeting by its Simbli MID.
            </p>
          </div>
          <div className="flex items-end gap-3 max-w-sm">
            <label className="flex-1 block text-sm text-slate-700">
              Simbli MID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={simbliId}
                onChange={(e) => setSimbliId(e.target.value)}
                placeholder="e.g. 12345"
              />
            </label>
            <button
              onClick={handleSingle}
              disabled={busy || !simbliId.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
            >
              Import
            </button>
          </div>
        </div>
      </section>

      {/* ── Status banner ────────────────────────────────────────────────── */}
      <OpBanner status={opStatus} />
    </div>
  );
};
