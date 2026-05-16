import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMeetings } from "../api/hooks";
import type { Meeting } from "../types";

const NO_VOTE_TYPES = new Set([
  "work session",
  "board work session",
  "budget hearing",
]);

type CoverageFilter = "all" | "with-votes" | "no-formal-votes" | "needs-extraction";
type SortOption = "newest" | "oldest" | "most-votes";

const isNoVoteType = (type: string) => NO_VOTE_TYPES.has(type.toLowerCase());

const normalizeText = (value?: string | number | null) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatMeetingDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

const formatMeetingDateLong = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const getCoverage = (meeting: Meeting) => {
  const hasVotes = (meeting.voteItemCount ?? 0) > 0;
  const noFormalVotes = !hasVotes && isNoVoteType(meeting.type);

  if (hasVotes) {
    return {
      key: "with-votes" as const,
      label: `${meeting.voteItemCount} vote item${meeting.voteItemCount === 1 ? "" : "s"}`,
      description: "Open extracted vote items and source links for this meeting.",
      searchTerms: "vote items extracted vote data votes available covered",
      tone: "bg-emerald-100 text-emerald-800",
    };
  }

  if (noFormalVotes) {
    return {
      key: "no-formal-votes" as const,
      label: "No formal votes",
      description: "Work sessions and hearings are discussion-only - no formal votes are recorded.",
      searchTerms: "no formal votes discussion only work session hearing",
      tone: "bg-slate-100 text-slate-600",
    };
  }

  return {
    key: "needs-extraction" as const,
    label: "No extracted vote data",
    description: "Open meeting details and source links. No vote data has been extracted for this meeting yet.",
    searchTerms: "no extracted vote data needs extraction missing uncovered",
    tone: "bg-amber-100 text-amber-800",
  };
};

const getMeetingSearchText = (meeting: Meeting) => {
  const date = new Date(meeting.date);
  const coverage = getCoverage(meeting);
  return normalizeSearch(
    [
      meeting.title,
      meeting.type,
      formatMeetingDate(meeting.date),
      formatMeetingDateLong(meeting.date),
      Number.isNaN(date.getTime()) ? "" : date.getFullYear(),
      Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("en-US", { month: "long" }),
      Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("en-US", { month: "short" }),
      meeting.simbliId,
      meeting.sourceUrl,
      meeting.minutesUrl,
      meeting.ingestionStatus,
      meeting.verificationStatus,
      coverage.label,
      coverage.searchTerms,
    ]
      .map(normalizeText)
      .join(" "),
  );
};

export const Meetings = () => {
  const { data, isLoading, error } = useMeetings();
  const [searchText, setSearchText] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  const meetings = useMemo(() => data ?? [], [data]);

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    meetings.forEach((meeting) => {
      const type = normalizeText(meeting.type);
      if (type) values.add(type);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [meetings]);

  const yearOptions = useMemo(() => {
    const values = new Set<string>();
    meetings.forEach((meeting) => {
      const date = new Date(meeting.date);
      if (!Number.isNaN(date.getTime())) values.add(date.getFullYear().toString());
    });
    return Array.from(values).sort((a, b) => b.localeCompare(a));
  }, [meetings]);

  const coverageCounts = useMemo(() => {
    const counts: Record<CoverageFilter, number> = {
      all: meetings.length,
      "with-votes": 0,
      "no-formal-votes": 0,
      "needs-extraction": 0,
    };
    meetings.forEach((meeting) => {
      counts[getCoverage(meeting).key] += 1;
    });
    return counts;
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    const queryTerms = normalizeSearch(searchText).split(/\s+/).filter(Boolean);

    const filtered = meetings.filter((meeting) => {
      const coverage = getCoverage(meeting);
      const date = new Date(meeting.date);

      if (coverageFilter !== "all" && coverage.key !== coverageFilter) return false;
      if (selectedType !== "all" && meeting.type !== selectedType) return false;
      if (selectedYear !== "all") {
        if (Number.isNaN(date.getTime()) || date.getFullYear().toString() !== selectedYear) {
          return false;
        }
      }
      if (selectedMonth !== "all") {
        if (Number.isNaN(date.getTime()) || (date.getMonth() + 1).toString() !== selectedMonth) {
          return false;
        }
      }

      if (queryTerms.length === 0) return true;
      const searchable = getMeetingSearchText(meeting);
      return queryTerms.every((term) => searchable.includes(term));
    });

    return filtered.sort((a, b) => {
      if (sortOption === "most-votes") {
        return (b.voteItemCount ?? 0) - (a.voteItemCount ?? 0) || b.date.localeCompare(a.date);
      }
      const dateCompare = a.date.localeCompare(b.date);
      return sortOption === "oldest" ? dateCompare : -dateCompare;
    });
  }, [meetings, searchText, coverageFilter, selectedType, selectedYear, selectedMonth, sortOption]);

  const hasActiveFilters = Boolean(
    normalizeText(searchText) ||
    coverageFilter !== "all" ||
    selectedType !== "all" ||
    selectedYear !== "all" ||
    selectedMonth !== "all" ||
    sortOption !== "newest",
  );

  const resetFilters = () => {
    setSearchText("");
    setCoverageFilter("all");
    setSelectedType("all");
    setSelectedYear("all");
    setSelectedMonth("all");
    setSortOption("newest");
  };

  if (isLoading) return <p>Loading meetings…</p>;
  if (error) return <p className="text-red-600">Failed to load meetings.</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Meetings</h1>
        <p className="text-sm text-slate-600">
          Discovered board meetings with source links and extracted vote coverage status. The
          meeting list is broader than the extracted vote dataset.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-2">
            Search meetings
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </div>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title, date, type, source, status..."
                className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  aria-label="Clear meeting search"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Type
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Year
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Month
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All months</option>
              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].map((month, index) => (
                <option key={month} value={(index + 1).toString()}>
                  {month}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Sort
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most-votes">Most vote items</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "All", count: coverageCounts.all },
              { key: "with-votes", label: "With votes", count: coverageCounts["with-votes"] },
              { key: "no-formal-votes", label: "No formal votes", count: coverageCounts["no-formal-votes"] },
              { key: "needs-extraction", label: "Needs extraction", count: coverageCounts["needs-extraction"] },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCoverageFilter(option.key as CoverageFilter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  coverageFilter === option.key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option.label} <span className="tabular-nums">{option.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Showing <span className="font-semibold text-slate-700">{filteredMeetings.length.toLocaleString()}</span> of{" "}
              {data.length.toLocaleString()} meetings
            </span>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="font-semibold text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
            >
              Reset filters
            </button>
          </div>
        </div>
      </section>

      {filteredMeetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No matching meetings found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Try searching for a meeting title, date, source URL, or vote status.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredMeetings.map((meeting) => {
            const coverage = getCoverage(meeting);

            return (
              <Link
                to={`/meetings/${meeting.id}`}
                key={meeting.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">
                    {formatMeetingDate(meeting.date)} · {meeting.type}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${coverage.tone}`}>
                    {coverage.label}
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold text-slate-900">{meeting.title}</p>
                <p className="mt-1 text-sm text-slate-600">{coverage.description}</p>
                <p className="mt-2 text-xs text-slate-500 break-all">Source: {meeting.sourceUrl}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
