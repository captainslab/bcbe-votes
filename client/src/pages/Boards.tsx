import { Link } from "react-router-dom";
import { useBoards } from "../api/hooks";

export const Boards = () => {
  const { data: boards, isLoading } = useBoards();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fund Transparency</h1>
        <p className="mt-2 text-slate-500 text-sm">
          These boards are seeking community funding to get tracked on BoardVotes.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/4" />
              <div className="h-2 bg-slate-100 rounded w-full" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !boards || boards.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-8 py-12 text-center">
          <p className="text-slate-500 text-sm">
            No boards are currently seeking funding. Be the first to submit one.
          </p>
          <Link
            to="/request"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Submit a board
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {boards.map((board) => {
            const pct = Math.min(100, Math.round((board.pledgedAmount / board.goalAmount) * 100));
            return (
              <Link
                key={board.slug}
                to={`/boards/${board.slug}`}
                className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{board.boardName}</p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {board.state}
                    </span>
                  </div>
                  <span
                    className={
                      board.status === "funded"
                        ? "shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
                        : "shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700"
                    }
                  >
                    {board.status}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      <span className="font-semibold text-slate-700">${board.pledgedAmount.toLocaleString()}</span>
                      {" "}of ${board.goalAmount.toLocaleString()} funded
                    </span>
                    <span>{board.pledgeCount ?? 0} {(board.pledgeCount ?? 0) === 1 ? "backer" : "backers"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
