import type { PropertyAction } from "../db/schema";
import { logger } from "../logging/logger";

const EXTRACTION_MODEL = "openai/gpt-4o-mini";
const MAX_CONTENT_CHARS = 3000;

const isPropertyTitle = (title?: string | null, section?: string | null) => {
  const text = `${title ?? ""} ${section ?? ""}`.toLowerCase();
  return /\b(property|real\s+estate|lease|easement|conveyance|purchase\s+agreement|sale|deed|facility|facilities|construction|renovation|site\s+survey|building|capital\s+improvement|public\s+works|architect|engineering\s+services|owner[\s/]+engineer)\b/.test(text);
};

const buildExtractionText = (
  contentText: string | null | undefined,
  summaryText: string | null | undefined,
  motionText: string | null | undefined,
  sourceExcerpt: string | null | undefined,
): string | null => {
  const candidates = [contentText, summaryText, motionText, sourceExcerpt]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  if (candidates.length === 0) return null;
  return candidates.join("\n\n").slice(0, MAX_CONTENT_CHARS);
};

const SYSTEM_PROMPT = `You extract structured property/real estate action records from school board meeting agenda items. Output valid JSON only — no markdown fences, no explanation.`;

const buildUserPrompt = (
  itemTitle: string,
  agendaSection: string | null | undefined,
  text: string,
) => `Extract all property or real estate actions from the following school board agenda item.

Item title: ${itemTitle}
Agenda section: ${agendaSection ?? itemTitle}

Content:
${text}

Return a JSON array. Each element must follow this exact shape:
{
  "actionType": "purchase" | "sale" | "lease" | "easement" | "conveyance" | "construction" | "renovation" | "agreement" | "survey" | "other",
  "partyName": "Name of the other party (person, company, or organization), or null",
  "location": "City, neighborhood, or general area (e.g. Bay Minette, Fairhope), or null",
  "address": "Street address if explicitly mentioned, or null",
  "statedUse": "Purpose or intended use of the property (e.g. emergency shelter, school expansion), or null",
  "term": "Duration of agreement if applicable (e.g. 2-year lease), or null",
  "effectiveDate": "Date as it appears in source, or null"
}

If the item is not about a specific property transaction or agreement, return [].`;

const parseEntities = (raw: string): PropertyAction[] | null => {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is PropertyAction =>
        typeof item === "object" &&
        item !== null &&
        typeof item.actionType === "string",
    );
  } catch {
    return null;
  }
};

export const extractPropertyEntities = async (input: {
  itemTitle: string;
  agendaSection?: string | null | undefined;
  contentText?: string | null | undefined;
  summaryText?: string | null | undefined;
  motionText?: string | null | undefined;
  sourceExcerpt?: string | null | undefined;
}): Promise<PropertyAction[] | null> => {
  if (!isPropertyTitle(input.itemTitle, input.agendaSection)) return null;

  const text = buildExtractionText(
    input.contentText,
    input.summaryText,
    input.motionText,
    input.sourceExcerpt,
  );
  if (!text) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY not set — skipping property entity extraction");
    return null;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://boardvotes.io",
        "X-Title": "BoardVotes.io",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input.itemTitle, input.agendaSection, text) },
        ],
        max_completion_tokens: 500,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Property entity extraction API call failed");
      return null;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const entities = parseEntities(content);
    if (entities === null) {
      logger.warn({ content }, "Could not parse property entity extraction response");
      return null;
    }

    return entities.length > 0 ? entities : null;
  } catch (err) {
    logger.warn({ err }, "Property entity extraction failed");
    return null;
  }
};
