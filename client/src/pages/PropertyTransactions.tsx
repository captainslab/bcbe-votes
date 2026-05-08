import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVotes } from "../api/hooks";
import { Badge } from "../components/Badge";
import type { PropertyAction, VoteItem } from "../types";

type ActionTypeFilter =
  | "all"
  | "purchase"
  | "sale"
  | "lease"
  | "easement"
  | "conveyance"
  | "construction"
  | "renovation"
  | "agreement"
  | "survey"
  | "other";

const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const getOutcomeLabel = (vote: VoteItem) => {
  const tally = vote.voteTally ?? {};
  const yes = tally.yes ?? 0;
  const no = tally.no ?? 0;
  const abstain = tally.abstain ?? 0;
  const total = yes + no + abstain;
  if (total > 0) {
    const carried = yes > no;
    const tallyStr = abstain > 0 ? `${yes}–${no}, ${abstain} abstained` : `${yes}–${no}`;
    return carried ? `Carried (${tallyStr})` : `Failed (${tallyStr})`;
  }
  return "—";
};

const getSourceUrl = (vote: VoteItem) => {
  if (vote.sourceUrl && /^https?:\/\//i.test(vote.sourceUrl)) return vote.sourceUrl;
  if (vote.meeting?.sourceUrl && /^https?:\/\//i.test(vote.meeting.sourceUrl))
    return vote.meeting.sourceUrl;
  return null;
};

const ACTION_TYPE_LABELS: Record<PropertyAction["actionType"], string> = {
  purchase: "Purchase",
  sale: "Sale",
  lease: "Lease",
  easement: "Easement",
  conveyance: "Conveyance",
  construction: "Construction",
  renovation: "Renovation",
  agreement: "Agreement",
  survey: "Survey",
  other: "Other",
};

const actionTypeBadgeTone = (
  actionType: PropertyAction["actionType"],
): "blue" | "emerald" | "amber" | "violet" | "rose" | "slate" => {
  switch (actionType) {
    case "purchase":
      return "emerald";
    case "sale":
      return "rose";
    case "lease":
      return "blue";
    case "construction":
    case "renovation":
      return "amber";
    case "easement":
    case "conveyance":
      return "violet";
    default:
      return "slate";
  }
};

type PropertyDetailFieldProps = {
  label: string;
  value: string | null | undefined;
};

const PropertyDetailField = ({ label, value }: PropertyDetailFieldProps) => {
  if (!value) return null;
  return (
    <span className="inline-flex gap-1 text-xs text-slate-600">
      <span className="font-medium text-slate-500">{label}:</span>
      <span>{value}</span>
    </span>
  );
};

type PropertyCardProps = {
  vote: VoteItem;
  entity: PropertyAction;
  entityIndex: number;
  totalEntities: number;
};

const PropertyCard = ({ vote, entity, entityIndex, totalEntities }: PropertyCardProps) => {
  const meetingDate = vote.meeting?.date
    ? new Date(vote.meeting.date).toLocaleDateString()
    : "Unknown date";
  const meetingTitle = normalizeText(vote.meeting?.title) || "Unknown meeting";
  const sourceUrl = getSourceUrl(vote);
  const outcomeLabel = getOutcomeLabel(vote);
  const isCarried = outcomeLabel.startsWith("Carried");
  const isFailed = outcomeLabel.startsWith("Failed");

  const detailFields: { label: string; value: string | null | undefined }[] = [
    { label: "Party", value: entity.partyName },
    { label: "Address", value: entity.address },
    { label: "Location", value: entity.address ? null : entity.location },
    { label: "Use", value: entity.statedUse },
    { label: "Term", value: entity.term },
    { label: "Effective", value: entity.effectiveDate },
  ];

  const hasDetails = detailFields.some((f) => Boolean(f.value));

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {meetingDate} · {meetingTitle}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge tone={actionTypeBadgeTone(entity.actionType)}>
            {ACTION_TYPE_LABELS[entity.actionType]}
          </Badge>
          {outcomeLabel !== "—" && (
            <Badge tone={isCarried ? "emerald" : isFailed ? "rose" : "slate"}>
              {outcomeLabel}
            </Badge>
          )}
          {vote.isNonUnanimous && <Badge tone="amber">Non-unanimous</Badge>}
        </div>
      </div>

      <h3 className="mt-2 text-base font-semibold text-slate-900 leading-snug">
        {vote.itemTitle}
        {totalEntities > 1 && (
          <span className="ml-2 text-xs font-normal text-slate-400">
            (item {entityIndex + 1} of {totalEntities})
          </span>
        )}
      </h3>

      {hasDetails && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {detailFields.map((f) => (
            <PropertyDetailField key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-slate-600 underline">
            View official meeting record
          </a>
        ) : (
          <span>Source unavailable</span>
        )}
        <Link to={`/votes/${vote.id}`} className="font-semibold text-slate-700 underline">
          View vote detail
        </Link>
      </div>
    </article>
  );
};

type PropertyRow = {
  vote: VoteItem;
  entity: PropertyAction;
  entityIndex: number;
  totalEntities: number;
};

export const PropertyTransactions = () => {
  const { data, isLoading, error } = useVotes(false);
  const [searchText, setSearchText] = useState("");
  const [selectedActionType, setSelectedActionType] = useState<ActionTypeFilter>("all");

  const propertyVotes = useMemo(() => {
    return (data ?? []).filter(
      (vote): vote is VoteItem & { propertyEntities: PropertyAction[] } =>
        Array.isArray(vote.propertyEntities) && vote.propertyEntities.length > 0,
    );
  }, [data]);

  const meetingCount = useMemo(() => {
    const ids = new Set(propertyVotes.map((v) => v.meetingId));
    return ids.size;
  }, [propertyVotes]);

  const rows = useMemo((): PropertyRow[] => {
    const result: PropertyRow[] = [];
    for (const vote of propertyVotes) {
      const entities = vote.propertyEntities as PropertyAction[];
      for (let i = 0; i < entities.length; i++) {
        result.push({
          vote,
          entity: entities[i],
          entityIndex: i,
          totalEntities: entities.length,
        });
      }
    }
    // Sort by meeting date descending
    result.sort((a, b) =>
      (b.vote.meeting?.date ?? "").localeCompare(a.vote.meeting?.date ?? ""),
    );
    return result;
  }, [propertyVotes]);

  const filteredRows = useMemo(() => {
    const query = normalizeText(searchText).toLowerCase();

    return rows.filter(({ vote, entity }) => {
      if (selectedActionType !== "all" && entity.actionType !== selectedActionType) return false;

      if (query) {
        const searchable = [
          vote.itemTitle,
          entity.partyName,
          entity.location,
          entity.address,
          entity.statedUse,
          vote.meeting?.title,
        ]
          .map((s) => normalizeText(s).toLowerCase())
          .join(" ");
        if (!searchable.includes(query)) return false;
      }

      return true;
    });
  }, [rows, searchText, selectedActionType]);

  if (isLoading) return <p>Loading property transactions…</p>;
  if (error) return <p className="text-red-600">Unable to load property transaction records right now.</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Property Transactions</h1>
        <p className="text-sm text-slate-600">
          Board votes involving real property — purchases, leases, easements, construction, and
          related agreements extracted from official meeting records.
        </p>
      </div>

      <div className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{propertyVotes.length}</span> property
        transaction{propertyVotes.length !== 1 ? "s" : ""} across{" "}
        <span className="font-semibold text-slate-900">{meetingCount}</span> meeting
        {meetingCount !== 1 ? "s" : ""}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Search text
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, party, location, address, use…"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Action type
            <select
              value={selectedActionType}
              onChange={(event) => setSelectedActionType(event.target.value as ActionTypeFilter)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All action types</option>
              <option value="purchase">Purchase</option>
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
              <option value="easement">Easement</option>
              <option value="conveyance">Conveyance</option>
              <option value="construction">Construction</option>
              <option value="renovation">Renovation</option>
              <option value="agreement">Agreement</option>
              <option value="survey">Survey</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </section>

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No matching transactions found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Try adjusting the filters or clearing the search text.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRows.map(({ vote, entity, entityIndex, totalEntities }) => (
            <PropertyCard
              key={`${vote.id}-${entityIndex}`}
              vote={vote}
              entity={entity}
              entityIndex={entityIndex}
              totalEntities={totalEntities}
            />
          ))}
        </div>
      )}
    </div>
  );
};
