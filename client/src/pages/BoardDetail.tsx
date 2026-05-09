import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBoard, submitPledge } from "../api/hooks";

type PledgeForm = { pledgerName: string; pledgerEmail: string; amount: number };
type PledgeResult = { name: string; amount: number; funded: boolean; duplicate: boolean };

export const BoardDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { data: board, isLoading } = useBoard(slug);

  const [form, setForm] = useState<PledgeForm>({ pledgerName: "", pledgerEmail: "", amount: 25 });
  const [pledgeLoading, setPledgeLoading] = useState(false);
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [pledgeResult, setPledgeResult] = useState<PledgeResult | null>(null);

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";

  const handlePledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setPledgeLoading(true);
    setPledgeError(null);
    try {
      const result = await submitPledge(slug, form);
      setPledgeResult({
        name: form.pledgerName,
        amount: form.amount,
        funded: result.funded,
        duplicate: result.duplicate ?? false,
      });
    } catch {
      setPledgeError("Something went wrong. Please try again.");
    } finally {
      setPledgeLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-24" />
        <div className="h-8 bg-slate-100 rounded w-2/3" />
        <div className="h-4 bg-slate-100 rounded w-full" />
        <div className="h-4 bg-slate-100 rounded w-3/4" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-slate-500 text-sm">Board not found.</p>
        <Link to="/boards" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to boards
        </Link>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((board.pledgedAmount / board.goalAmount) * 100));
  const isFunded = board.status === "funded";
  const showSuccess = searchParams.get("success") === "1";

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Link to="/boards" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All boards
      </Link>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {board.state}
          </span>
          <span
            className={
              isFunded
                ? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700"
                : "rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
            }
          >
            {board.status}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{board.boardName}</h1>
      </div>

      {showSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
          Your submission was received! Share this page to help reach the funding goal.
        </div>
      )}

      {isFunded && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
          This board has been funded! Onboarding is in progress.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-slate-900">${board.pledgedAmount.toLocaleString()}</p>
            <p className="text-sm text-slate-500 mt-0.5">pledged of ${board.goalAmount.toLocaleString()} goal</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-slate-700">{board.pledges?.length ?? 0}</p>
            <p className="text-sm text-slate-500">{(board.pledges?.length ?? 0) === 1 ? "backer" : "backers"}</p>
          </div>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">{pct}% funded</p>
      </div>

      {!isFunded && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Add your pledge</h2>
          </div>

          {pledgeResult ? (
            <div className="px-6 py-8">
              {pledgeResult.duplicate ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800">
                  You've already pledged to this board.
                </div>
              ) : pledgeResult.funded ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
                  This board just hit its goal!
                </div>
              ) : (
                <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
                  Thanks {pledgeResult.name} — your ${pledgeResult.amount} pledge has been recorded. We'll reach out when this board is funded.
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handlePledge} className="px-6 py-5 space-y-4">
              <div>
                <label className={labelClass}>Your name</label>
                <input
                  type="text"
                  required
                  value={form.pledgerName}
                  onChange={(e) => setForm((f) => ({ ...f, pledgerName: e.target.value }))}
                  placeholder="Full name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Your email</label>
                <input
                  type="email"
                  required
                  value={form.pledgerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, pledgerEmail: e.target.value }))}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Pledge amount</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                  className={inputClass}
                />
              </div>
              {pledgeError && (
                <p className="text-xs text-red-600">{pledgeError}</p>
              )}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={pledgeLoading}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {pledgeLoading ? "Submitting…" : `Pledge $${form.amount}`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Backers</h2>
        </div>
        <div className="px-6 py-5">
          {!board.pledges || board.pledges.length === 0 ? (
            <p className="text-sm text-slate-500">Be the first to pledge.</p>
          ) : (
            <ul className="space-y-2">
              {board.pledges.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm text-slate-700">
                  <span>{p.pledgerName}</span>
                  <span className="font-medium text-slate-900">${p.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
