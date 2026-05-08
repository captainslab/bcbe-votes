import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMotions } from "../api/hooks";
import { Badge } from "../components/Badge";
import type { MotionsItem } from "../types";

type ActionFilter = "either" | "made" | "seconded";

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const getOutcomeFromTally = (tally: Record<string, number>, isNonUnanimous: boolean) => {
  const yes = tally.yes ?? 0;
  const no = tally.no ?? 0;
  const abstain = tally.abstain ?? 0;
  const total = yes + no + abstain;
  if (total === 0) return "—";
  const verb = yes > no ? "Carried" : "Failed";
  if (!isNonUnanimous) return `${verb} (unanimous)`;
  return abstain > 0 ? `${verb} (${yes}–${no}, ${abstain} abstained)` : `${verb} (${yes}–${no})`;
};

const getDisplayTitle = (item: MotionsItem) => {
  const candidates = [item.itemTitle, item.summaryText, item.motionText];
  const first = candidates
    .map((c) => normalizeText(c))
    .find((c) => c && c.toLowerCase() !== "needs review");
  return first || "Needs review";
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

const MotionCard = ({ item }: { item: MotionsItem }) => {
  const title = getDisplayTitle(item);
  const outcome = getOutcomeFromTally(item.voteTally, item.isNonUnanimous);
  const outcomeCarried = (item.voteTally.yes ?? 0) > (item.voteTally.no ?? 0);
  const meetingDate = formatDate(item.meetingDate);
  const meetingTitle = normalizeText(item.meetingTitle) || "—";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-500">{meetingDate} · {meetingTitle}</p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Badge tone={item.category === "Other / Needs Review" ? "amber" : "blue"}>
            {item.category || "Needs review"}
          </Badge>
          <Badge tone={item.verificationStatus === "verified" ? "emerald" : "amber"}>
            {item.verificationStatus === "verified" ? "Verified" : "Needs review"}
          </Badge>
          {item.isNonUnanimous && <Badge tone="amber">Non-unanimous</Badge>}
        </div>
      </div>

      <h3 className="mt-2 text-base font-semibold text-slate-900 leading-snug">{title}</h3>

      <p className="mt-1.5 text-sm text-slate-700">
        <span className="font-medium">Made by:</span>{" "}
        {item.madeByName ?? <span className="text-slate-400 italic">unknown</span>}
        {" · "}
        <span className="font-medium">Seconded by:</span>{" "}
        {item.secondedByName ?? <span className="text-slate-400 italic">unknown</span>}
      </p>

      <p className="mt-1 text-sm text-slate-700">
        <span className="font-medium">Outcome:</span>{" "}
        <span className={outcomeCarried ? "text-emerald-700" : "text-rose-700"}>{outcome}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-slate-600 underline">
            View official meeting record
          </a>
        ) : (
          <span>Source unavailable</span>
        )}
        <Link to={`/votes/${item.voteItemId}`} className="font-semibold text-slate-700 underline">
          View vote detail
        </Link>
      </div>
    </article>
  );
};

export const Motions = () => {
  const { data, isLoading, error } = useMotions();

  const [selectedMember, setSelectedMember] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("either");

  const allItems = useMemo(() => {
    if (!data) return [];
    return data.slice().sort((a, b) => {
      const dateA = a.meetingDate ? new Date(a.meetingDate).getTime() : 0;
      const dateB = b.meetingDate ? new Date(b.meetingDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [data]);

  const memberOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of allItems) {
      if (item.madeByName) names.add(item.madeByName);
      if (item.secondedByName) names.add(item.secondedByName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const item of allItems) {
      const cat = normalizeText(item.category) || "Needs review";
      cats.add(cat);
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (selectedCategory !== "all") {
        const cat = normalizeText(item.category) || "Needs review";
        if (cat !== selectedCategory) return false;
      }

      if (selectedMember !== "all") {
        if (actionFilter === "made" && item.madeByName !== selectedMember) return false;
        if (actionFilter === "seconded" && item.secondedByName !== selectedMember) return false;
        if (actionFilter === "either") {
          if (item.madeByName !== selectedMember && item.secondedByName !== selectedMember) return false;
        }
      } else if (actionFilter !== "either") {
        if (actionFilter === "made" && !item.madeByName) return false;
        if (actionFilter === "seconded" && !item.secondedByName) return false;
      }

      return true;
    });
  }, [allItems, selectedMember, selectedCategory, actionFilter]);

  const memberCount = useMemo(() => {
    const names = new Set<string>();
    for (const item of filteredItems) {
      if (item.madeByName) names.add(item.madeByName);
      if (item.secondedByName) names.add(item.secondedByName);
    }
    return names.size;
  }, [filteredItems]);

  if (isLoading) return <p>Loading motions…</p>;
  if (error) return <p className="text-red-600">Unable to load motions right now.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Motions</h1>
        <p className="text-sm text-slate-600">
          All vote items with a recorded motion maker or seconder, across all board members and meetings.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Member
            <select
              value={selectedMember}
              onChange={(event) => setSelectedMember(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All members</option>
              {memberOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Category
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All categories</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Action type
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value as ActionFilter)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="either">Made or seconded</option>
              <option value="made">Made only</option>
              <option value="seconded">Seconded only</option>
            </select>
          </label>
        </div>
      </section>

      <p className="text-sm text-slate-600">
        <span className="font-semibold">{filteredItems.length}</span>{" "}
        {filteredItems.length === 1 ? "motion" : "motions"} across{" "}
        <span className="font-semibold">{memberCount}</span>{" "}
        {memberCount === 1 ? "member" : "members"}
      </p>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No matching motions found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Try removing one or more filters to view additional motion records.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <MotionCard key={item.voteItemId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
