import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranscriptList, useTranscriptSearch } from "../api/hooks";
import type { TranscriptListItem, TranscriptSearchResult } from "../types";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatWordCount(n: number | null): string {
  if (n === null) return "";
  return n.toLocaleString() + " words";
}

function highlightTerms(text: string, query: string): React.ReactNode {
  if (!query || query.trim().length < 2) return text;
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <strong key={i} className="font-semibold text-slate-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function TranscriptCard({ item }: { item: TranscriptListItem }) {
  const dateLabel = item.date
    ? new Date(item.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown date";
  const duration = formatDuration(item.durationSeconds);
  const wordCount = formatWordCount(item.wordCount);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dateLabel}</p>
        {item.execSessionDetected && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
            Exec session
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-snug">{item.videoTitle}</p>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {wordCount && <span>{wordCount}</span>}
        {duration && <span>{duration}</span>}
        {item.meetingId && (
          <Link to={`/meetings/${item.meetingId}`} className="text-indigo-600 hover:underline">
            Meeting detail
          </Link>
        )}
      </div>
      {item.videoId && (
        <a
          href={`https://youtube.com/watch?v=${item.videoId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 self-start rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-white hover:bg-slate-700"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z" />
          </svg>
          Watch
        </a>
      )}
    </div>
  );
}

function SearchResultCard({ result, query }: { result: TranscriptSearchResult; query: string }) {
  const dateLabel = result.date
    ? new Date(result.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown date";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dateLabel}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{result.videoTitle}</p>
          {result.meetingId && (
            <Link to={`/meetings/${result.meetingId}`} className="text-xs text-indigo-600 hover:underline">
              Meeting detail
            </Link>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
          {result.totalMatches} match{result.totalMatches !== 1 ? "es" : ""}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {result.matches.map((match, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3">
            <a
              href={match.timestampUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-white hover:bg-slate-700"
              title="Watch on YouTube"
            >
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z" />
              </svg>
              {match.time}
            </a>
            <p className="text-sm text-slate-700 leading-relaxed italic">
              &ldquo;{highlightTerms(match.context, query)}&rdquo;
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Transcripts = () => {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: transcriptList, isLoading: listLoading } = useTranscriptList();
  const { data: searchResults, isLoading: searchLoading, isFetching } = useTranscriptSearch(debouncedQuery);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const isSearching = debouncedQuery.length >= 2;
  const isLoading = isSearching ? (searchLoading || isFetching) : listLoading;
  const totalTranscripts = transcriptList?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meeting Transcripts</h1>
          <p className="mt-1 text-sm text-slate-600">
            {totalTranscripts > 0 ? (
              <>
                {totalTranscripts} meetings with searchable transcripts &mdash; powered by Whisper speech-to-text
              </>
            ) : (
              "Searchable meeting transcripts — powered by Whisper speech-to-text"
            )}
          </p>
        </div>
        <Link to="/dashboard" className="text-sm font-semibold text-slate-700 hover:underline">
          Dashboard
        </Link>
      </div>

      {/* Search box */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search transcripts… e.g. real estate, budget, personnel"
          className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => { setInputValue(""); setDebouncedQuery(""); }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <p className="text-sm text-slate-500">
          {isSearching ? "Searching transcripts…" : "Loading transcripts…"}
        </p>
      )}

      {/* Search results */}
      {!isLoading && isSearching && (
        <div className="space-y-4">
          {searchResults && searchResults.length > 0 ? (
            <>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{searchResults.length}</span>{" "}
                meeting{searchResults.length !== 1 ? "s" : ""} matched &ldquo;{debouncedQuery}&rdquo;
              </p>
              {searchResults.map((result) => (
                <SearchResultCard key={result.videoId} result={result} query={debouncedQuery} />
              ))}
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">No results for &ldquo;{debouncedQuery}&rdquo;</p>
              <p className="mt-1 text-xs text-slate-400">Try a different term or browse all transcripts below.</p>
            </div>
          )}
        </div>
      )}

      {/* Default list view */}
      {!isLoading && !isSearching && transcriptList && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {transcriptList.map((item) => (
            <TranscriptCard key={item.videoId} item={item} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Transcripts generated by OpenAI Whisper from publicly available BCBE board meeting recordings.
        Timestamps link directly to the matching moment in the YouTube recording.
      </p>
    </div>
  );
};
