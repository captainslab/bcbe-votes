import { load } from "cheerio";
import { normalizeWhitespace } from "../../utils/text";

export type ParsedMeetingDetailBlock = {
  kind: "breadcrumb" | "heading" | "selector" | "shell" | "script" | "minutes-link";
  label: string;
  text: string;
  options?: { value: string; label: string }[];
  href?: string | null;
};

export type ParsedMeetingDetailPage = {
  simbliId: string;
  sourceUrl: string;
  meetingTitle: string | null;
  meetingDate: string | null;
  minutesUrl: string | null;
  selectionMechanism: {
    handlerName: string;
    mode: "client-redirect";
    redirectTemplate: string;
    supportingFields: string[];
  } | null;
  status: "minutes-found" | "shell-only" | "content-found";
  sourceBlocks: ParsedMeetingDetailBlock[];
};

const parseListingStyleDate = (value: string) => {
  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  if (!match) return null;

  const [, monthText, dayText, yearText, hourText, minuteText, periodText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  let hour = Number(hourText) % 12;
  if (periodText && periodText.toUpperCase() === "PM") hour += 12;
  const minute = Number(minuteText);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(utcMillis).toISOString();
};

const extractMeetingDate = ($: ReturnType<typeof load>) => {
  const bodyText = normalizeWhitespace($("body").text());
  const match = bodyText.match(
    /(?:meeting date|date - time)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
  );
  if (!match) return null;
  return parseListingStyleDate(`${match[1]} - ${match[2]}`);
};

const extractMinutesUrl = ($: ReturnType<typeof load>) => {
  const link = $("a")
    .filter((_i, el) => {
      const text = normalizeWhitespace($(el).text()).toLowerCase();
      const onclick = String($(el).attr("onclick") ?? "").toLowerCase();
      return text.includes("minutes") || onclick.includes("viewminutes");
    })
    .first();

  const href = link.attr("href");
  if (href && href !== "javascript:void(0);" && href.startsWith("http")) return href;
  return null;
};

const extractSelectBlocks = ($: ReturnType<typeof load>) => {
  const blocks: ParsedMeetingDetailBlock[] = [];

  $("select").each((_index, select) => {
    const options = $(select)
      .find("option")
      .map((_i, option) => ({
        value: normalizeWhitespace($(option).attr("value")),
        label: normalizeWhitespace($(option).text()),
      }))
      .get()
      .filter((option) => option.label);

    if (!options.length) return;

    const label = options.some((option) => option.label.includes("Meeting Type"))
      ? "meeting-type-selector"
      : options.some((option) => option.label.includes("Select Meeting"))
        ? "meeting-selector"
        : normalizeWhitespace($(select).attr("id")) || "selector";

    blocks.push({
      kind: "selector",
      label,
      text: options.map((option) => option.label).join(" | "),
      options,
    });
  });

  return blocks;
};

const extractNavBlock = ($: ReturnType<typeof load>) => {
  const navText = normalizeWhitespace(
    $("body")
      .find("a")
      .map((_i, el) => normalizeWhitespace($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 8)
      .join(" > "),
  );

  if (!navText) return null;

  return {
    kind: "breadcrumb" as const,
    label: "navigation",
    text: navText,
  };
};

const extractShellBlock = ($: ReturnType<typeof load>) => {
  const shell = $("app-viewmeeting").first();
  if (!shell.length) return null;

  return {
    kind: "shell" as const,
    label: "app-viewmeeting",
    text: "<app-viewmeeting></app-viewmeeting>",
  };
};

const extractHeadingBlock = ($: ReturnType<typeof load>) => {
  const heading = normalizeWhitespace($("h1").first().text() || $("title").first().text());
  if (!heading) return null;

  return {
    kind: "heading" as const,
    label: "page-heading",
    text: heading,
  };
};

const extractMinutesBlock = ($: ReturnType<typeof load>) => {
  const link = $("a")
    .filter((_i, el) => {
      const text = normalizeWhitespace($(el).text()).toLowerCase();
      const onclick = String($(el).attr("onclick") ?? "").toLowerCase();
      return text.includes("minutes") || onclick.includes("viewminutes");
    })
    .first();

  if (!link.length) return null;

  return {
    kind: "minutes-link" as const,
    label: "minutes-link",
    text: normalizeWhitespace(link.text()),
    href: link.attr("href") ?? null,
  };
};

const extractScriptBlock = ($: ReturnType<typeof load>) => {
  const scriptTexts = $("script")
    .map((_i, el) => normalizeWhitespace($(el).html()))
    .get()
    .filter((text) => text && /(meeting|agenda|minute)/i.test(text));

  if (!scriptTexts.length) return null;

  return {
    kind: "script" as const,
    label: "embedded-script",
    text: scriptTexts.slice(0, 2).join("\n\n").slice(0, 1200),
  };
};

const extractSelectionMechanism = ($: ReturnType<typeof load>) => {
  const scriptText = $("script")
    .map((_i, el) => normalizeWhitespace($(el).html()))
    .get()
    .find((text) => text.includes("OnClientSelectedIndexChanged") && text.includes("ViewMeeting.aspx"));

  if (!scriptText) return null;

  return {
    handlerName: "OnClientSelectedIndexChanged",
    mode: "client-redirect" as const,
    redirectTemplate: "/SB_Meetings/ViewMeeting.aspx?S={siteId}&MID={mid}",
    supportingFields: [
      "hdnSiteIDMeetings_UCs_MeetingDDL",
      "hdn_ChangeUrl_DMeetings_UCs_MeetingDDL",
      "ctl00_ContentPlaceHolder1_uc_MeetingDDL_radCombo_MeetingTypes",
      "ctl00_ContentPlaceHolder1_uc_MeetingDDL_radCombo_Meetings",
    ],
  };
};

export const parseMeetingDetailPage = (
  html: string,
  sourceUrl: string,
  simbliId: string,
): ParsedMeetingDetailPage => {
  const $ = load(html);
  const sourceBlocks: ParsedMeetingDetailBlock[] = [];

  const heading = extractHeadingBlock($);
  if (heading) sourceBlocks.push(heading);

  const nav = extractNavBlock($);
  if (nav) sourceBlocks.push(nav);

  const selectorBlocks = extractSelectBlocks($);
  sourceBlocks.push(...selectorBlocks);

  const shell = extractShellBlock($);
  if (shell) sourceBlocks.push(shell);

  const script = extractScriptBlock($);
  if (script) sourceBlocks.push(script);

  const selectionMechanism = extractSelectionMechanism($);

  const minutesBlock = extractMinutesBlock($);
  if (minutesBlock) sourceBlocks.push(minutesBlock);

  const minutesUrl = minutesBlock?.href ?? null;
  const meetingDate = extractMeetingDate($);
  const status = minutesUrl
    ? "minutes-found"
    : selectorBlocks.length || shell
      ? "shell-only"
      : "content-found";

  return {
    simbliId,
    sourceUrl,
    meetingTitle: heading?.text ?? null,
    meetingDate,
    minutesUrl,
    selectionMechanism,
    status,
    sourceBlocks,
  };
};
