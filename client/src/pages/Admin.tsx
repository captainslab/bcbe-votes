import { useState } from "react";
import { api, setAdminAuth } from "../api/client";

type ImportResponse = { status: string; processed?: number; votesCreated?: number };

export const Admin = () => {
  const [startMid, setStartMid] = useState("");
  const [endMid, setEndMid] = useState("");
  const [simbliId, setSimbliId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("change-me");

  const handleBatch = async () => {
    try {
      setAdminAuth(user, pass);
      const res = await api.post<ImportResponse>("/admin/batch-fetch", {
        startMid: startMid ? Number(startMid) : undefined,
        endMid: endMid ? Number(endMid) : undefined,
      });
      setMessage(`Batch started: processed ${res.data.processed ?? 0}`);
    } catch (err) {
      setMessage("Failed to start batch import");
    }
  };

  const handleSingle = async () => {
    try {
      setAdminAuth(user, pass);
      await api.post(`/admin/import-meeting/${simbliId}`);
      setMessage("Meeting import triggered");
    } catch (err) {
      setMessage("Failed to import meeting");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin Controls</h1>
        <p className="text-sm text-slate-600">
          Imports are automated and idempotent. Provide MID ranges to refresh data from Simbli.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Admin routes are protected with HTTP Basic Auth. Use operational credentials only.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Credentials</h2>
          <label className="text-sm text-slate-700">
            Username
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={pass}
              type="password"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Batch import by MID</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-700">
              Start MID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={startMid}
                onChange={(e) => setStartMid(e.target.value)}
              />
            </label>
            <label className="text-sm text-slate-700">
              End MID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={endMid}
                onChange={(e) => setEndMid(e.target.value)}
              />
            </label>
          </div>
          <button
            onClick={handleBatch}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Trigger batch import
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Re-import single meeting</h2>
        <label className="text-sm text-slate-700">
          Simbli MID
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={simbliId}
            onChange={(e) => setSimbliId(e.target.value)}
            placeholder="e.g., 12345"
          />
        </label>
        <button
          onClick={handleSingle}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          Import meeting
        </button>
      </div>

      {message && <div className="rounded-md bg-slate-900 px-4 py-3 text-white">{message}</div>}
    </div>
  );
};
