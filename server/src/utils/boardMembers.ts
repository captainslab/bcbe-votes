import { normalizeWhitespace } from "./text";

const canonicalAliasEntries = [
  ["mr. woerner", "Jason Woerner"],
  ["mr. christenberry", "Cecil Christenberry"],
  ["mrs. lindsey", "Andrea Lindsey"],
  ["mrs. bradley", "April Bradley"],
  ["mr. bradley", "Kenneth Bradley"],
  ["mrs. kirby", "Rondi Kirby"],
  ["mr. myrick", "Tony Myrick"],
] as const;

const canonicalAliasMap = new Map<string, string>(canonicalAliasEntries);

const uniq = <T>(values: T[]) => [...new Set(values)];

export const canonicalizeBoardMemberName = (rawName?: string | null) => {
  const normalized = normalizeWhitespace(rawName);
  if (!normalized) return "";
  return canonicalAliasMap.get(normalized.toLowerCase()) ?? normalized;
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
