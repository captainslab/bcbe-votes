import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useVendorProfile } from "../api/hooks";
import type { VendorBoardVote, VendorContract } from "../types";

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatDollars(amount: number): string {
  if (amount === 0) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Category badge colors ───────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Technology": "bg-indigo-100 text-indigo-800",
  "Software": "bg-violet-100 text-violet-800",
  "Construction": "bg-amber-100 text-amber-800",
  "Facilities": "bg-orange-100 text-orange-800",
  "Transportation": "bg-cyan-100 text-cyan-800",
  "Food & Nutrition": "bg-lime-100 text-lime-800",
  "Professional Services": "bg-blue-100 text-blue-800",
  "Curriculum": "bg-teal-100 text-teal-800",
  "Athletics": "bg-green-100 text-green-800",
  "Insurance": "bg-rose-100 text-rose-800",
  "Staffing": "bg-purple-100 text-purple-800",
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "bg-slate-100 text-slate-700";
}

// ─── Vote chip colors ─────────────────────────────────────────────────────────

function voteChipClass(vote: string): string {
  const v = vote.toLowerCase();
  if (v === "yes") return "bg-emerald-100 text-emerald-800";
  if (v === "no") return "bg-red-100 text-red-800";
  if (v === "abstain") return "bg-slate-200 text-slate-600";
  if (v === "recused") return "bg-orange-100 text-orange-700";
  if (v === "absent") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-500";
}

// ─── Contract card ────────────────────────────────────────────────────────────

const ContractCard = ({ contract }: { contract: VendorContract }) => {
  const [expanded, setExpanded] = useState(false);

  const preview =
    contract.sourceExcerpt && contract.sourceExcerpt.length > 120
      ? contract.sourceExcerpt.slice(0, 120) + "…"
      : contract.sourceExcerpt;

  const outcomeClass =
    contract.outcome.toLowerCase().includes("pass") ||
    contract.outcome.toLowerCase().includes("carried") ||
    contract.outcome.toLowerCase().includes("approved")
      ? "bg-emerald-100 text-emerald-800"
      : contract.outcome.toLowerCase().includes("fail") || contract.outcome.toLowerCase().includes("denied")
        ? "bg-red-100 text-red-800"
        : "bg-slate-100 text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
            {formatDate(contract.date)} · {contract.meetingTitle}
          </p>
          <p className="text-base font-semibold text-slate-900 leading-snug">{contract.itemTitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 items-center">
          {contract.dollarAmount > 0 && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
              {contract.dollarAmountStr ?? formatDollars(contract.dollarAmount)}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcomeClass}`}>
            {contract.outcome || "Unknown"}
          </span>
          {contract.isNonUnanimous && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Non-unanimous
            </span>
          )}
        </div>
      </div>

      {/* Source excerpt */}
      {contract.sourceExcerpt && (
        <div className="text-sm text-slate-600 leading-relaxed">
          <p className={expanded ? "" : "line-clamp-none"}>
            {expanded ? contract.sourceExcerpt : preview}
          </p>
          {contract.sourceExcerpt.length > 120 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800 underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Vote chips */}
      {contract.voteRecords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contract.voteRecords.map((r) => (
            <span
              key={r.memberName}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${voteChipClass(r.vote)}`}
            >
              {r.memberName.split(" ").pop()}: {r.vote}
            </span>
          ))}
        </div>
      )}

      {/* Footer links */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
        {contract.sourceUrl ? (
          <a
            href={contract.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline text-slate-600 hover:text-slate-900"
          >
            View official record
          </a>
        ) : (
          <span>Source unavailable</span>
        )}
        <Link
          to={`/votes/${contract.voteItemId}`}
          className="font-semibold text-slate-700 underline hover:text-slate-900"
        >
          View vote detail
        </Link>
      </div>
    </div>
  );
};

// ─── Board voting table ───────────────────────────────────────────────────────

const BoardVotingTable = ({ rows }: { rows: VendorBoardVote[] }) => {
  const sorted = [...rows]
    .filter((r) => r.total > 0)
    .sort((a, b) => {
      const aYesPct = a.total > 0 ? a.yes / a.total : 1;
      const bYesPct = b.total > 0 ? b.yes / b.total : 1;
      return aYesPct - bYesPct; // ascending — most pushback first
    });

  if (sorted.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Board voting breakdown</h2>
      <p className="mt-1 text-sm text-slate-500">
        Sorted by support rate ascending — members who pushed back most appear first.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2 text-right">Yes</th>
              <th className="px-4 py-2 text-right">No</th>
              <th className="px-4 py-2 text-right">Abstain</th>
              <th className="px-4 py-2 text-right">Yes %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => {
              const yesPct = row.total > 0 ? (row.yes / row.total) * 100 : 100;
              return (
                <tr key={row.memberName} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.memberName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-medium">
                    {row.yes || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-700 font-medium">
                    {row.no || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {row.abstain || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-700">
                    {yesPct.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const VendorDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useVendorProfile(slug ?? "");

  if (isLoading) return <p className="text-slate-500">Loading vendor profile…</p>;
  if (error) return <p className="text-red-600">Failed to load vendor profile.</p>;
  if (!data) return null;

  const contracts = [...data.contracts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Link
          to="/vendors"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Back to vendors
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">{data.name}</h1>
            {data.categories.map((cat) => (
              <span key={cat} className={`rounded-full px-3 py-1 text-sm font-semibold ${categoryColor(cat)}`}>
                {cat}
              </span>
            ))}
          </div>

          {data.aliases.length > 0 && (
            <p className="text-sm text-slate-500">
              Also appears as:{" "}
              <span className="italic">{data.aliases.join(", ")}</span>
            </p>
          )}

          {data.description && (
            <p className="text-sm text-slate-700 leading-relaxed max-w-2xl">{data.description}</p>
          )}
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm text-center">
            <p className="text-xl font-bold text-slate-900">{data.totalContracts}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total contracts</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm text-center">
            <p className="text-xl font-bold text-indigo-700">{formatDollars(data.totalSpend)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total tracked spend</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm text-center">
            <p className="text-xl font-bold text-slate-900">{formatDate(data.firstSeen)}</p>
            <p className="text-xs text-slate-500 mt-0.5">First contract</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm text-center">
            <p className="text-xl font-bold text-slate-900">{formatDate(data.lastSeen)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Last contract</p>
          </div>
        </div>
      </div>

      {/* ── Funding sources ─────────────────────────────────────────────────── */}
      {data.fundingSources.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Funding sources</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.fundingSources.map((source) => (
              <span
                key={source}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 font-medium"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Board voting breakdown ───────────────────────────────────────────── */}
      {data.boardVoting.length > 0 && (
        <BoardVotingTable rows={data.boardVoting} />
      )}

      {/* ── Contract history ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Contract history{" "}
          <span className="text-sm font-normal text-slate-500">({contracts.length})</span>
        </h2>
        {contracts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 text-center">
            No contract records found.
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => (
              <ContractCard key={contract.voteItemId} contract={contract} />
            ))}
          </div>
        )}
      </div>

      {/* ── Data caveat footer ──────────────────────────────────────────────── */}
      <p className="text-xs text-slate-400 border-t border-slate-100 pt-4">
        Vendor names and dollar amounts are auto-extracted from public meeting records and may be
        incomplete.
      </p>
    </div>
  );
};
