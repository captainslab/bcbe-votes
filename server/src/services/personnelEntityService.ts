import type { PersonnelAction } from "../db/schema";
import { logger } from "../logging/logger";

const EXTRACTION_MODEL = "openai/gpt-4o-mini";
const MAX_CONTENT_CHARS = 3000;

const isPersonnelTitle = (title?: string | null, section?: string | null) => {
  const text = `${title ?? ""} ${section ?? ""}`.toLowerCase();
  return /\b(personnel|hire|hiring|employ|resign|termination|retirement|retire|suspension|transfer|leaves?\s+of\s+absence|classified|certified|appoint)\b/.test(text);
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

const SYSTEM_PROMPT = `You extract structured personnel action records from school board meeting agenda items. Output valid JSON only — no markdown fences, no explanation.`;

const buildUserPrompt = (
  itemTitle: string,
  agendaSection: string | null | undefined,
  text: string,
) => `Extract all individual personnel actions from the following school board agenda item.

Item title: ${itemTitle}
Agenda section: ${agendaSection ?? itemTitle}

Content:
${text}

Return a JSON array. Each element must follow this exact shape:
{
  "personName": "Full Name",
  "actionType": "appointment" | "resignation" | "retirement" | "termination" | "transfer" | "leave" | "other",
  "position": "Job Title or null",
  "schoolOrDepartment": "School or Department or null",
  "replacing": "Name of person being replaced, or null",
  "effectiveDate": "Date as it appears in source, e.g. 04/08/2026, or null",
  "classification": "classified" | "certified" | "administrative" | null
}

If no individual names are identifiable, return [].`;

const parseEntities = (raw: string): PersonnelAction[] | null => {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is PersonnelAction =>
        typeof item === "object" &&
        item !== null &&
        typeof item.personName === "string" &&
        item.personName.length > 0,
    );
  } catch {
    return null;
  }
};

export const extractPersonnelEntities = async (input: {
  itemTitle: string;
  agendaSection?: string | null | undefined;
  contentText?: string | null | undefined;
  summaryText?: string | null | undefined;
  motionText?: string | null | undefined;
  sourceExcerpt?: string | null | undefined;
}): Promise<PersonnelAction[] | null> => {
  if (!isPersonnelTitle(input.itemTitle, input.agendaSection)) return null;

  const text = buildExtractionText(
    input.contentText,
    input.summaryText,
    input.motionText,
    input.sourceExcerpt,
  );
  if (!text) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY not set — skipping personnel entity extraction");
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
        max_completion_tokens: 1000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Personnel entity extraction API call failed");
      return null;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const entities = parseEntities(content);
    if (entities === null) {
      logger.warn({ content }, "Could not parse personnel entity extraction response");
      return null;
    }

    return entities.length > 0 ? entities : null;
  } catch (err) {
    logger.warn({ err }, "Personnel entity extraction failed");
    return null;
  }
};
