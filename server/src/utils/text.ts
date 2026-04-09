export const normalizeWhitespace = (value?: string | null) =>
  (value ?? "").replace(/\s+/g, " ").trim();

export const toTitle = (value: string) =>
  value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
