import { normalizeWhitespace } from "./text";

const honorificPrefixPattern = /^\s*(?:mr|mrs|ms|miss|dr)\.?\s+/i;
const honorificTokenPattern = /\b(?:mr|mrs|ms|miss|dr)\.?\s+/gi;

const titleSurnameCanonicalMap = new Map<string, string>([
  ["mrs:cauley", "Shannon Cauley"],
  ["ms:cauley", "Shannon Cauley"],
  ["mr:johnson", "Mike Johnson"],
  ["mrs:lindsey", "Andrea Lindsey"],
  ["ms:lindsey", "Andrea Lindsey"],
  ["miss:lindsey", "Andrea Lindsey"],
  ["mr:myrick", "Tony Myrick"],
  ["mrs:kirby", "Rondi Kirby"],
  ["ms:kirby", "Rondi Kirby"],
  ["mr:woerner", "Jason P. Woerner"],
  ["mr:christenberry", "Cecil Christenberry"],
  ["mr:bradley", "Ken Bradley"],
  ["mrs:bradley", "April Bradley"],
  ["ms:bradley", "April Bradley"],
]);

const surnameCanonicalMap = new Map<string, string>([
  ["cauley", "Shannon Cauley"],
  ["johnson", "Mike Johnson"],
  ["lindsey", "Andrea Lindsey"],
  ["myrick", "Tony Myrick"],
  ["kirby", "Rondi Kirby"],
  ["woerner", "Jason P. Woerner"],
  ["christenberry", "Cecil Christenberry"],
]);

export const stripGenderedHonorifics = (value?: string | null) =>
  normalizeWhitespace(value).replace(honorificTokenPattern, "").trim();

export const sanitizeBoardVotesPersonName = (value?: string | null) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  const withoutHonorific = stripGenderedHonorifics(normalized);
  const hadHonorific = honorificPrefixPattern.test(normalized);
  if (hadHonorific) {
    const honorific = normalized.match(honorificPrefixPattern)?.[0]?.replace(/\./g, "").trim().toLowerCase() ?? "";
    const tokens = withoutHonorific.split(/\s+/).filter(Boolean);
    const surname = tokens[tokens.length - 1]?.toLowerCase() ?? "";
    return titleSurnameCanonicalMap.get(`${honorific}:${surname}`) ?? surnameCanonicalMap.get(surname) ?? withoutHonorific;
  }
  return withoutHonorific;
};

export const sanitizeBoardVotesDisplayText = (value?: string | null) => {
  let output = normalizeWhitespace(value);
  if (!output) return output;
  output = output.replace(/\b(Mrs|Ms|Miss|Mr|Dr)\.?\s+([A-Z][A-Za-z.'-]+)/g, (match, title, surname) => {
    const key = `${String(title).toLowerCase()}:${String(surname).toLowerCase()}`;
    const canonical = titleSurnameCanonicalMap.get(key) ?? surnameCanonicalMap.get(String(surname).toLowerCase());
    return canonical ?? stripGenderedHonorifics(match);
  });
  return normalizeWhitespace(output);
};
