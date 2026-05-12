import { useState } from "react";
import { Link } from "react-router-dom";
import { useVendors } from "../api/hooks";
import { StatCard } from "../components/StatCard";
import type { VendorEntry } from "../types";

type SortKey = "spend" | "frequency";

function formatDollars(amount: number): string {
  if (amount === 0) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortVendors(vendors: VendorEntry[], key: SortKey): VendorEntry[] {
  return [...vendors].sort((a, b) => {
    if (key === "spend") {
      return b.total_spend - a.total_spend || b.count - a.count;
    }
    return b.count - a.count || b.total_spend - a.total_spend;
  });
}

export const Vendors = () => {
  const { data, isLoading, error } = useVendors();
  const [sortKey, setSortKey] = useState<SortKey>("spend");

  if (isLoading) return <p className="text-slate-500">Loading procurement data…</p>;
  if (error) return <p className="text-red-600">Failed to load vendor data.</p>;
  if (!data) return null;

  const { vendors, total_procurement_items } = data;
  const uniqueVendors = vendors.length;
  const totalSpend = vendors.reduce((sum, v) => sum + v.total_spend, 0);
  const vendorsWithSpend = vendors.filter((v) => v.total_spend > 0).length;

  const sorted = sortVendors(vendors, sortKey);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Procurement &amp; Vendors</h1>
        <p className="text-sm text-slate-600 max-w-2xl">
          Board-approved contracts, vendor relationships, and procurement votes extracted from
          meeting minutes. Dollar amounts are sourced directly from vote text and may be partial —
          use as a guide, not an official ledger.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Procurement votes"
          value={total_procurement_items.toLocaleString()}
          helper="Items matching procurement keywords"
        />
        <StatCard
          label="Unique vendors identified"
          value={uniqueVendors.toLocaleString()}
          helper={`${vendorsWithSpend} with tracked dollar amounts`}
        />
        <StatCard
          label="Total tracked spend"
          value={totalSpend > 0 ? formatDollars(totalSpend) : "—"}
          helper="Sum of dollar amounts mentioned in vote text"
        />
      </div>

      {/* Sort toggle + table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Sort by:</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button
              onClick={() => setSortKey("spend")}
              className={
                sortKey === "spend"
                  ? "px-3 py-1.5 bg-indigo-600 text-white font-medium"
                  : "px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-50 transition"
              }
            >
              Total spend
            </button>
            <button
              onClick={() => setSortKey("frequency")}
              className={
                sortKey === "frequency"
                  ? "px-3 py-1.5 bg-indigo-600 text-white font-medium"
                  : "px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-50 transition"
              }
            >
              Vote frequency
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Vendor</th>
                <th className="hidden px-4 py-3 font-semibold text-slate-700 lg:table-cell">Categories</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Votes</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Total Spend</th>
                <th className="hidden px-4 py-3 font-semibold text-slate-700 sm:table-cell">
                  Last Vote
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sorted.map((vendor) => (
                <tr key={vendor.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={vendor.slug ? `/vendors/${vendor.slug}` : `/votes?search=${encodeURIComponent(vendor.name)}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {vendor.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {vendor.categories.map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-right tabular-nums">
                    {vendor.count}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-right tabular-nums font-medium">
                    {formatDollars(vendor.total_spend)}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">
                    {formatDate(vendor.last_seen)}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No vendors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400">
          Vendor names are extracted automatically from vote item titles using pattern matching.
          Some entries may be imprecise. Dollar amounts are pulled from raw vote text; totals may
          reflect partial data. Last updated: {new Date(data.generated_at).toLocaleString()}.
        </p>
      </div>
    </div>
  );
};
