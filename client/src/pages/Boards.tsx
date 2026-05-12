import { Link } from "react-router-dom";
import { useHubBoards } from "../api/hooks";
import type { Board } from "../types";

function StatusBadge({ status }: { status: Board["status"] }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
        Live
      </span>
    );
  if (status === "onboarding")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 inline-block" />
        Onboarding
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 inline-block" />
      Coming Soon
    </span>
  );
}

export const Boards = () => {
  const { data: boards, isLoading } = useHubBoards();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Boards</h1>
        <p className="mt-2 text-slate-500 text-sm">
          All boards tracked on BoardVotes.io. Each live board has its own page with full vote history, member records, and source links.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : !boards || boards.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-8 py-12 text-center">
          <p className="text-slate-500 text-sm">No boards yet.</p>
          <Link
            to="/request"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Request a board
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {boards.map((board) => {
            const isLive = board.status === "live";
            const href = isLive ? `https://${board.slug}.boardvotes.io` : undefined;
            const inner = (
              <div
                className={`rounded-xl border bg-white p-5 flex flex-col gap-3 transition ${
                  isLive
                    ? "border-indigo-200 hover:border-indigo-400 hover:shadow-sm cursor-pointer"
                    : "border-slate-200 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{board.name}</p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {board.state}
                    </span>
                  </div>
                  <StatusBadge status={board.status} />
                </div>
                {board.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{board.description}</p>
                )}
              </div>
            );

            return isLive ? (
              <a key={board.slug} href={href} rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <div key={board.slug}>{inner}</div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        Don't see your board?{" "}
        <Link to="/request" className="font-medium text-indigo-700 hover:underline">
          Request it here
        </Link>
        {" "}— community funding unlocks full onboarding.
      </div>
    </div>
  );
};
