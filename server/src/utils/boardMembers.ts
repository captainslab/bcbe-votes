import { getCanonicalBoardMemberName } from "./boardVotes";
import { sanitizeBoardVotesPersonName } from "./nameSanitizer";
import { normalizeWhitespace } from "./text";

const canonicalAliasEntries = [
  ["kenneth bradley", "Ken Bradley"],
] as const;

const canonicalAliasMap = new Map<string, string>(canonicalAliasEntries);

const uniq = <T>(values: T[]) => [...new Set(values)];

export const canonicalizeBoardMemberName = (rawName?: string | null) => {
  const canonical = getCanonicalBoardMemberName(rawName);
  if (canonical) return canonical;
  const normalized = sanitizeBoardVotesPersonName(rawName);
  if (!normalized) return "";
  return canonicalAliasMap.get(normalized.toLowerCase()) ?? "";
};

export const getBoardMemberLookupVariants = (rawName?: string | null) => {
  const normalized = normalizeWhitespace(rawName);
  const canonical = canonicalizeBoardMemberName(rawName);
  return uniq([normalized, canonical].filter(Boolean));
};

export const mergeBoardMemberAliases = (
  currentAliases: string[] | null | undefined,
  rawName?: string | null,
) => {
  const variants = getBoardMemberLookupVariants(rawName);
  return uniq(
    [...(currentAliases ?? []), ...variants]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean),
  );
};
