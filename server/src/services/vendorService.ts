/**
 * vendorService.ts
 *
 * Extracts vendor/company names from procurement-related vote_items and returns
 * a ranked list with spend estimates. Logic ported from vendor-extraction.js.
 * Results are cached in memory for 1 hour.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VendorEntry = {
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  count: number;
  total_spend: number;
  dollar_amounts: string[];
  vote_item_ids: number[];
  last_seen: string | null;
};

export type VendorsResponse = {
  vendors: VendorEntry[];
  total_procurement_items: number;
  generated_at: string;
};

export type VendorContract = {
  voteItemId: number;
  date: string;
  meetingTitle: string;
  itemTitle: string;
  dollarAmountStr: string | null;
  dollarAmount: number;
  outcome: string;
  isNonUnanimous: boolean;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  voteRecords: Array<{ memberName: string; vote: string }>;
};

export type VendorBoardVoting = {
  memberName: string;
  yes: number;
  no: number;
  abstain: number;
  total: number;
};

export type VendorProfile = {
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  description: string;
  firstSeen: string;
  lastSeen: string;
  totalContracts: number;
  totalSpend: number;
  fundingSources: string[];
  contracts: VendorContract[];
  boardVoting: VendorBoardVoting[];
};

// ---------------------------------------------------------------------------
// Vendor alias normalization
// ---------------------------------------------------------------------------

const VENDOR_ALIASES: Record<string, string> = {
  "ALTAPOINTE": "AltaPointe Health Systems",
  "ALTA POINTE": "AltaPointe Health Systems",
  "SOLUTION TREE PLC CONSULTANT": "Solution Tree",
  "SOLUTION TREE": "Solution Tree",
  "KIDS FIRST EDUCATION": "Kids First",
  "KIDS FIRST ELEMENTARY 1ST-5TH MATH ASSESSMENTS": "Kids First",
  "KIDS FIRST": "Kids First",
  "KIMBERLY P MACNAUGHTON": "Kimberly MacNaughton",
  "KIMBERLY MACNAUGHTON": "Kimberly MacNaughton",
  "ALLIED INSTRUCTIONAL": "Allied Instructional Services",
  "ALLIED INSTRUCTIONAL SERVICES": "Allied Instructional Services",
  "ADVANCED BEHAVIORAL & EDUCATION": "Advanced Behavioral & Education Consulting",
  "BEHAVIORAL CONSULTANTS": "Behavioral Consultants",
  "BALDWIN COUNTY EDUCATION COALITION": "Baldwin County Education Coalition",
  "ENCORE REHABILITATION": "Encore Rehabilitation Services",
  "WATERFORD RESEARCH INSTITUTE": "Waterford Research Institute",
  "LBP INTERPRETING": "LBP Interpreting",
  "COASTAL MAKERS": "Coastal Makers",
  "PAINT SLINGERS": "Paint Slingers",
};

/**
 * Normalize a raw extracted vendor name using the alias map.
 * Returns the canonical name if found, otherwise the original name.
 */
function normalizeVendorName(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (VENDOR_ALIASES[upper]) return VENDOR_ALIASES[upper];
  // Try partial matches: check if any alias key is contained in the raw name
  for (const [key, canonical] of Object.entries(VENDOR_ALIASES)) {
    if (upper === key) return canonical;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["behavioral", "aba", "therapy", "therapist", "mental health", "counseling", "health systems"], category: "Behavioral Health" },
  { keywords: ["interpreting", "interpreter", "language", "translation"], category: "Language Services" },
  { keywords: ["technology", "software", "digital", "cyber", "archiving", "email"], category: "Technology" },
  { keywords: ["construction", "addition", "renovation", "building", "facility", "phase"], category: "Construction & Facilities" },
  { keywords: ["professional development", "training", "workshop", "consultant"], category: "Professional Development" },
  { keywords: ["curriculum", "textbook", "learning", "instruction", "assessment", "reading"], category: "Curriculum & Instruction" },
  { keywords: ["rehabilitation", "physical therapy", "occupational"], category: "Rehabilitation Services" },
  { keywords: ["food", "nutrition", "cafeteria"], category: "Food Services" },
  { keywords: ["transportation", "bus"], category: "Transportation" },
  { keywords: ["legal", "attorney", "counsel"], category: "Legal Services" },
  { keywords: ["financial", "financing", "investment"], category: "Financial Services" },
  { keywords: ["cleaning", "janitorial", "custodial"], category: "Facilities & Maintenance" },
  { keywords: ["art", "music", "theatre", "maker", "creative"], category: "Arts & Enrichment" },
];

export function inferVendorCategories(titles: string[], excerpts: string[]): string[] {
  const combined = [...titles, ...excerpts].join(" ").toLowerCase();
  const matched = CATEGORY_RULES
    .filter(rule => rule.keywords.some(kw => combined.includes(kw)))
    .map(rule => rule.category);
  return matched.length > 0 ? matched : ["Professional Services"];
}

// ---------------------------------------------------------------------------
// Auto-description
// ---------------------------------------------------------------------------

const DESCRIPTION_PATTERNS: RegExp[] = [
  /to approve the contract with [^,."]+?(?:for ([^."]{5,120}))/i,
  /to approve (?:the )?(?:agreement|contract) (?:with [^,."]+?)?(?:for ([^."]{5,120}))/i,
  /for services (?:as |related to )?([^."]{5,120})/i,
  /(?:paid|to be paid) from ([^."]{5,80})/i,
];

export function generateVendorDescription(
  name: string,
  titles: string[],
  excerpts: string[]
): string {
  const texts = [...excerpts.filter(Boolean), ...titles.filter(Boolean)];
  const services: string[] = [];
  const funding: string[] = [];

  for (const text of texts) {
    for (const pattern of DESCRIPTION_PATTERNS) {
      const m = text.match(pattern);
      if (m && m[1]) {
        const fragment = m[1].trim().replace(/\s+/g, " ").replace(/[,.]$/, "");
        if (fragment.length > 5 && fragment.length < 120) {
          if (/fund|title|esser|federal|local/i.test(fragment)) {
            funding.push(fragment.toLowerCase());
          } else {
            services.push(fragment.toLowerCase());
          }
          break;
        }
      }
    }
  }

  const service = services[0] ?? null;
  const fund = funding[0] ?? null;

  if (service && fund) {
    return `${name} provides ${service}. Contracts paid from ${fund}.`;
  } else if (service) {
    return `${name} provides ${service}.`;
  } else if (fund) {
    return `${name} has been contracted for services, paid from ${fund}.`;
  }
  return `${name} has been approved for contracted services with the district.`;
}

// ---------------------------------------------------------------------------
// Funding source extraction
// ---------------------------------------------------------------------------

const FUNDING_PATTERNS: RegExp[] = [
  /paid from ([A-Za-z0-9 &]+?)\s+funds/gi,
  /from ([A-Za-z0-9 &]+?)\s+funds/gi,
  /\b(Title\s+(?:I{1,3}|IV|V|[A-Z]))\b/gi,
  /\b(federal funds)\b/gi,
  /\b(local funds)\b/gi,
  /\b(ESSER(?:\s+(?:I{1,3}|funds))?)\b/gi,
];

export function extractFundingSources(excerpts: string[]): string[] {
  const sources = new Set<string>();
  const combined = excerpts.filter(Boolean).join(" ");

  for (const pattern of FUNDING_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(combined)) !== null) {
      const raw = (m[1] ?? m[0]).trim();
      if (raw.length > 1 && raw.length < 80) {
        // Title-case normalization
        sources.add(raw.replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
  }

  return [...sources];
}

// ---------------------------------------------------------------------------
// Vendor slug
// ---------------------------------------------------------------------------

export function toVendorSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
}

// ---------------------------------------------------------------------------
// Procurement keyword filter
// ---------------------------------------------------------------------------

const PROCUREMENT_KEYWORDS = [
  "contract",
  "vendor",
  "award",
  "bid",
  "purchase",
  "rfp",
  "rfq",
  "approve",
  "authorize",
];

// ---------------------------------------------------------------------------
// Vendor extraction patterns
// ---------------------------------------------------------------------------

const PRECEDING_PATTERNS: RegExp[] = [
  // "APPROVAL OF CONTRACT - VENDOR NAME"
  /\bapproval\s+of\s+(?:amended\s+)?contracts?\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "AMENDED CONTRACT - VENDOR NAME"
  /\bamended\s+contract\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "CONTRACT - VENDOR NAME" (standalone)
  /(?<!approval\s+of\s)(?<!amended\s)\bcontract\s*[-–]\s*([A-Z][A-Z0-9&',.\s-]{2,60}?)(?:\s*$)/gi,
  // "with VENDOR NAME"
  /\bwith\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})(?:\s+(?:for|at|to|in|of)|$)/gi,
  // "award to VENDOR NAME"
  /\baward(?:ed)?\s+to\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})/gi,
  // "from VENDOR NAME"
  /\bfrom\s+([A-Z][A-Za-z0-9&',.]+(?:\s+[A-Z][A-Za-z0-9&',.]+){0,5})/gi,
  // "VENDOR NAME CONTRACT" prefix pattern
  /^([A-Z][A-Z\s&',.-]{4,50}?)\s+(?:CONTRACT|AGREEMENT)\b/gi,
];

const STRIP_TRAILING_RE =
  /[,\s]+(?:for|at|in|of|the|a|an|its|services?|contracts?|agreement|inc\.?|llc\.?|ltd\.?|corp\.?|consulting|group|associates?|solutions?|training|learning)\s*$/i;

const SKIP_NAMES = new Set([
  "approval",
  "approval of amended",
  "services",
  "service",
  "contract",
  "contracts",
  "agreement",
  "agreements",
  "property purchase",
  "property purchase agreement",
  "the board",
  "school board",
  "the district",
  "district",
  "superintendent",
  "interpreting services",
  "behavioral analysts",
  "textbook",
  "training",
  "professional development",
  "learning",
  "education",
  "early learning",
  "county",
  "assistant superintendent",
  "csfo appointment and employment",
  "csfo",
  "bids",
  "proposals",
  "bids/proposals",
  "model",
  "form",
  "teams",
  "purchase",
  "employment",
  "appointment",
  "interpreters",
]);

const SKIP_PATTERNS: RegExp[] = [
  /^\d{4}[-–]\d{4}$/,
  /\bappointment\b/i,
  /\bemployment\b/i,
  /\bpurchase agreement\b/i,
  /\bpurchase\b.*\bproperty\b/i,
  /\bproperty\b.*\bpurchase\b/i,
  /\bnon-renewal\b/i,
  /\bprincipal\b/i,
  /\bfinancial officer\b/i,
  /\bsuperintendent\b/i,
  /\bworkshop\b/i,
  /\btraining\s+(?:at|onsite|in)\b/i,
  /^[A-Z]{2,4}$/,
];

const DOLLAR_RE = /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|M|B|K))?/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDollarAmount(str: string): number | null {
  const s = str.replace(/\$|,/g, "").trim();
  const multipliers: Record<string, number> = {
    million: 1e6,
    billion: 1e9,
    thousand: 1e3,
    m: 1e6,
    b: 1e9,
    k: 1e3,
  };
  const match = s.match(/^([\d.]+)\s*([a-z]+)?$/i);
  if (!match || !match[1]) return null;
  const base = parseFloat(match[1]);
  const mult = match[2] ? (multipliers[match[2].toLowerCase()] ?? 1) : 1;
  return Math.round(base * mult);
}

function cleanVendorName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/^\d+\.\s+/, "");
  name = name.replace(/[,;.:]+$/, "");
  name = name.replace(/\s+\d{2,4}[-–]\d{2,4}$/, "");
  let prev: string;
  do {
    prev = name;
    name = name.replace(STRIP_TRAILING_RE, "").trim();
  } while (name !== prev);
  return name.trim();
}

function extractDollarAmounts(text: string): string[] {
  const matches: string[] = [];
  DOLLAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOLLAR_RE.exec(text)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

function extractVendors(title: string, contentText: string | null): string[] {
  const text = [title, contentText].filter(Boolean).join(" ");
  const vendors = new Set<string>();

  for (const pattern of PRECEDING_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!match[1]) continue;
      const name = cleanVendorName(match[1]);
      const nameLower = name.toLowerCase();
      const skipByPattern = SKIP_PATTERNS.some((p) => p.test(name));
      if (
        name.length >= 3 &&
        !SKIP_NAMES.has(nameLower) &&
        !skipByPattern &&
        /^[A-Z]/.test(name)
      ) {
        vendors.add(name);
      }
    }
  }

  return [...vendors];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry = {
  data: VendorsResponse;
  expiresAt: number;
};

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Internal aggregation type (tracks raw aliases before normalization)
// ---------------------------------------------------------------------------

type VendorEntryInternal = VendorEntry & {
  rawNames: Set<string>;
};

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

type VoteItemRow = {
  id: number;
  item_title: string;
  content_text: string | null;
  source_excerpt: string | null;
  motion_text: string | null;
  meeting_date: Date | string | null;
};

export async function getVendors(): Promise<VendorsResponse> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  const whereClauses = PROCUREMENT_KEYWORDS.map(
    (k) => sql`vi.item_title ILIKE ${"%" + k + "%"}`
  );

  // Build a raw SQL query with OR conditions
  const rows = await db.execute<VoteItemRow>(sql`
    SELECT
      vi.id,
      vi.item_title,
      vi.content_text,
      vi.source_excerpt,
      vi.motion_text,
      m.date AS meeting_date
    FROM vote_items vi
    JOIN meetings m ON m.id = vi.meeting_id
    WHERE (
      ${sql.join(whereClauses, sql` OR `)}
    )
    ORDER BY m.date DESC
  `);

  const vendorMap = new Map<string, VendorEntryInternal>();

  for (const row of rows.rows) {
    const rawNames = extractVendors(row.item_title, row.content_text);
    const fullText = [row.item_title, row.source_excerpt, row.motion_text, row.content_text]
      .filter(Boolean)
      .join(" ");
    const dollars = extractDollarAmounts(fullText);

    for (const rawName of rawNames) {
      const canonicalName = normalizeVendorName(rawName);

      if (!vendorMap.has(canonicalName)) {
        vendorMap.set(canonicalName, {
          name: canonicalName,
          slug: toVendorSlug(canonicalName),
          aliases: [],
          categories: ["Professional Services"],
          count: 0,
          total_spend: 0,
          vote_item_ids: [],
          dollar_amounts: [],
          last_seen: null,
          rawNames: new Set<string>(),
        });
      }
      const entry = vendorMap.get(canonicalName)!;

      // Track raw alias if different from canonical
      if (rawName !== canonicalName) {
        entry.rawNames.add(rawName);
      }

      entry.count += 1;
      entry.vote_item_ids.push(row.id);
      if (dollars.length) {
        entry.dollar_amounts.push(...dollars);
        for (const d of dollars) {
          entry.total_spend += parseDollarAmount(d) ?? 0;
        }
      }
      const rowDate = row.meeting_date
        ? typeof row.meeting_date === "string"
          ? row.meeting_date
          : (row.meeting_date as Date).toISOString()
        : null;
      if (rowDate && (!entry.last_seen || rowDate > entry.last_seen)) {
        entry.last_seen = rowDate;
      }
    }
  }

  // Collect all item titles and excerpts per vendor for category inference
  // Build a quick map of voteItemId → row
  const rowById = new Map<number, VoteItemRow>();
  for (const row of rows.rows) {
    rowById.set(row.id, row);
  }

  // Sort by total_spend desc, then count desc
  const vendors = [...vendorMap.values()].sort(
    (a, b) => b.total_spend - a.total_spend || b.count - a.count
  );

  // Finalize each vendor entry
  for (const v of vendors) {
    v.dollar_amounts = [...new Set(v.dollar_amounts)];
    v.aliases = [...v.rawNames];

    // Infer category from all associated vote item titles + excerpts
    const titles = v.vote_item_ids
      .map((id) => rowById.get(id)?.item_title ?? "")
      .filter(Boolean);
    const excerpts = v.vote_item_ids
      .map((id) => rowById.get(id)?.source_excerpt ?? "")
      .filter(Boolean);
    v.categories = inferVendorCategories(titles, excerpts);
  }

  const result: VendorsResponse = {
    vendors: vendors.map(({ rawNames: _rawNames, ...rest }) => rest),
    total_procurement_items: rows.rows.length,
    generated_at: new Date().toISOString(),
  };

  cache = { data: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

// ---------------------------------------------------------------------------
// Vendor profile by slug
// ---------------------------------------------------------------------------

type VoteItemDetailRow = {
  id: number;
  item_title: string;
  source_excerpt: string | null;
  motion_text: string | null;
  result: string | null;
  is_non_unanimous: boolean;
  meeting_date: Date | string | null;
  meeting_title: string | null;
  meeting_source_url: string | null;
};

type VoteRecordRow = {
  vote_item_id: number;
  vote_value: string;
  member_name: string | null;
};

export async function getVendorBySlug(slug: string): Promise<VendorProfile | null> {
  // First get the full vendor list to find canonical name + aliases
  const { vendors } = await getVendors();
  const vendor = vendors.find((v) => v.slug === slug);
  if (!vendor) return null;

  // All names to search for (canonical + raw aliases)
  const searchNames = [vendor.name, ...vendor.aliases];

  // Build ILIKE conditions for each name variant against item_title
  const titleConditions = searchNames.map(
    (n) => sql`vi.item_title ILIKE ${"%" + n + "%"}`
  );

  const rows = await db.execute<VoteItemDetailRow>(sql`
    SELECT
      vi.id,
      vi.item_title,
      vi.source_excerpt,
      vi.motion_text,
      vi.result,
      vi.is_non_unanimous,
      m.date AS meeting_date,
      m.title AS meeting_title,
      m.source_url AS meeting_source_url
    FROM vote_items vi
    JOIN meetings m ON m.id = vi.meeting_id
    WHERE (
      ${sql.join(titleConditions, sql` OR `)}
    )
    ORDER BY m.date DESC
  `);

  if (rows.rows.length === 0) return null;

  const voteItemIds = rows.rows.map((r) => r.id);

  // Fetch vote records for all these items
  const voteRecords =
    voteItemIds.length > 0
      ? await db.execute<VoteRecordRow>(sql`
          SELECT
            vr.vote_item_id,
            vr.vote_value,
            bm.name AS member_name
          FROM vote_records vr
          LEFT JOIN board_members bm ON bm.id = vr.board_member_id
          WHERE vr.vote_item_id = ANY(ARRAY[${sql.join(
            voteItemIds.map((id) => sql`${id}`),
            sql`, `
          )}]::int[])
        `)
      : { rows: [] as VoteRecordRow[] };

  // Group vote records by vote_item_id
  const voteRecordsByItemId = new Map<number, Array<{ memberName: string; vote: string }>>();
  for (const vr of voteRecords.rows) {
    if (!voteRecordsByItemId.has(vr.vote_item_id)) {
      voteRecordsByItemId.set(vr.vote_item_id, []);
    }
    if (vr.member_name) {
      voteRecordsByItemId.get(vr.vote_item_id)!.push({
        memberName: vr.member_name,
        vote: vr.vote_value,
      });
    }
  }

  // Build contracts
  const contracts: VendorContract[] = rows.rows.map((row) => {
    const fullText = [row.item_title, row.source_excerpt, row.motion_text]
      .filter(Boolean)
      .join(" ");
    const dollars = [...new Set(extractDollarAmounts(fullText))];
    const dollarAmountStr = dollars[0] ?? null;
    const dollarAmount = dollars.reduce((sum, d) => sum + (parseDollarAmount(d) ?? 0), 0);

    const meetingDate = row.meeting_date
      ? typeof row.meeting_date === "string"
        ? row.meeting_date
        : (row.meeting_date as Date).toISOString()
      : "";

    const records = voteRecordsByItemId.get(row.id) ?? [];
    const noCount = records.filter((r) => r.vote === "no").length;
    const yesCount = records.filter((r) => r.vote === "yes").length;
    const r = (row.result ?? "").toLowerCase();
    let outcome: string;
    if (records.length > 0) {
      if (noCount === 0) outcome = "Passed Unanimously";
      else if (yesCount > noCount) outcome = "Passed";
      else outcome = "Failed";
    } else if (r.includes("unanimously") || r.includes("all voiced approval")) {
      outcome = "Passed Unanimously";
    } else if (r.includes("carries") || r.includes("approved") || r.includes("motion") || r.includes("seconded")) {
      outcome = row.is_non_unanimous ? "Passed" : "Passed Unanimously";
    } else {
      outcome = "Passed";
    }

    return {
      voteItemId: row.id,
      date: meetingDate,
      meetingTitle: row.meeting_title ?? "",
      itemTitle: row.item_title,
      dollarAmountStr,
      dollarAmount,
      outcome,
      isNonUnanimous: row.is_non_unanimous,
      sourceExcerpt: row.source_excerpt,
      sourceUrl: row.meeting_source_url,
      voteRecords: records,
    };
  });

  // Aggregate board voting stats
  const memberVotes = new Map<string, { yes: number; no: number; abstain: number; total: number }>();
  for (const contract of contracts) {
    for (const vr of contract.voteRecords) {
      if (!memberVotes.has(vr.memberName)) {
        memberVotes.set(vr.memberName, { yes: 0, no: 0, abstain: 0, total: 0 });
      }
      const stats = memberVotes.get(vr.memberName)!;
      stats.total += 1;
      if (vr.vote === "yes") stats.yes += 1;
      else if (vr.vote === "no") stats.no += 1;
      else if (vr.vote === "abstain") stats.abstain += 1;
    }
  }

  const boardVoting: VendorBoardVoting[] = [...memberVotes.entries()]
    .map(([memberName, stats]) => ({ memberName, ...stats }))
    .sort((a, b) => b.total - a.total);

  // Compute firstSeen / lastSeen
  const dates = rows.rows
    .map((r) =>
      r.meeting_date
        ? typeof r.meeting_date === "string"
          ? r.meeting_date
          : (r.meeting_date as Date).toISOString()
        : null
    )
    .filter((d): d is string => d !== null)
    .sort();

  const firstSeen = dates[0] ?? "";
  const lastSeen = dates[dates.length - 1] ?? "";

  // Collect excerpts and titles for description + funding
  const allExcerpts = rows.rows.map((r) => r.source_excerpt ?? "").filter(Boolean);
  const allTitles = rows.rows.map((r) => r.item_title).filter(Boolean);

  const totalSpend = contracts.reduce((sum, c) => sum + c.dollarAmount, 0);

  return {
    name: vendor.name,
    slug: vendor.slug,
    aliases: vendor.aliases,
    categories: vendor.categories,
    description: generateVendorDescription(vendor.name, allTitles, allExcerpts),
    firstSeen,
    lastSeen,
    totalContracts: contracts.length,
    totalSpend,
    fundingSources: extractFundingSources(allExcerpts),
    contracts,
    boardVoting,
  };
}
