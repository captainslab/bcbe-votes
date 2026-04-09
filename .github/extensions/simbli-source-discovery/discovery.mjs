const DEFAULT_SITE_ID = "200015";

const cluePatterns = [
  /\/Services\/api\/[A-Za-z0-9_?=&/%.-]+/gi,
  /\/api\/[A-Za-z0-9_?=&/%.-]+/gi,
  /__doPostBack\([^)]*\)/gi,
  /OnClientSelectedIndexChanged/gi,
  /GetMeetingPermission/gi,
  /(?:fetch|XMLHttpRequest|\.ajax|axios\.(?:get|post|request)|\$\.(?:get|post|ajax))/gi,
  /JSON\.parse\(/gi,
  /JSON\.stringify\(/gi,
  /atob\(/gi,
];

const normalizeWhitespace = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unique = (values) => [...new Set(values.filter(Boolean))];

const resolveUrl = (base, value) => {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
};

const summarizeValue = (value, limit = 160) => {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const extractAttr = (tagText, attrName) => {
  const match = tagText.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? "";
};

const extractTitle = (html) => {
  const heading = normalizeWhitespace(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (heading) return heading;
  return normalizeWhitespace(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || null;
};

const extractScriptSrcs = (html, baseUrl) => {
  const srcs = [];
  const scriptTagRegex = /<script\b([^>]*)><\/script>|<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptTagRegex)) {
    const attrs = match[1] ?? match[2] ?? "";
    const src = extractAttr(attrs, "src");
    if (src) srcs.push(resolveUrl(baseUrl, src));
  }
  return unique(srcs);
};

const extractHiddenInputs = (html) => {
  const inputs = [];
  const inputRegex = /<input\b([^>]*type=["']hidden["'][^>]*)>/gi;
  for (const match of html.matchAll(inputRegex)) {
    const attrs = match[1] ?? "";
    const name = extractAttr(attrs, "name");
    const id = extractAttr(attrs, "id");
    const value = extractAttr(attrs, "value");
    if (name || id) {
      inputs.push({
        name: name || id,
        id: id || null,
        valuePreview: summarizeValue(value, 80) || null,
        valueLength: value ? value.length : 0,
      });
    }
  }
  return inputs;
};

const extractForms = (html) => {
  const forms = [];
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  for (const match of html.matchAll(formRegex)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const action = extractAttr(attrs, "action") || null;
    const method = (extractAttr(attrs, "method") || "get").toLowerCase();
    const postback = body.includes("__doPostBack(");
    if (action || postback) {
      forms.push({ action, method, postback });
    }
  }
  return forms;
};

const extractInlineClues = (html) => {
  const clues = [];
  const scriptBlockRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptBlockRegex)) {
    const attrs = match[1] ?? "";
    const body = normalizeWhitespace(match[2] ?? "");
    if (!body) continue;
    for (const pattern of cluePatterns) {
      if (!pattern.test(body)) continue;
      pattern.lastIndex = 0;
      clues.push({
        source: "inline-script",
        scriptType: extractAttr(attrs, "type") || null,
        pattern: pattern.source,
        snippet: body.slice(0, 500),
      });
    }
    patternReset();
  }
  return clues;
};

const patternReset = () => {
  for (const pattern of cluePatterns) pattern.lastIndex = 0;
};

const snippetAround = (text, needle, radius = 140) => {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return null;
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + needle.length + radius));
};

const collectMatches = (text, patterns, source) => {
  const matches = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = normalizeWhitespace(match[0]);
      const snippet = snippetAround(text, value) ?? value;
      matches.push({ source, pattern: pattern.source, value, snippet });
    }
  }
  return matches;
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://simbli.eboardsolutions.com/",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`);
  }

  return await response.text();
};

const buildTargetUrl = ({ url, simbliId, siteId = DEFAULT_SITE_ID }) => {
  if (url) return url;
  if (simbliId) return `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=${siteId}&MID=${simbliId}`;
  return null;
};

const detectSelectionMechanism = (html) => {
  const scriptText = html.match(/<script\b[^>]*>([\s\S]*?OnClientSelectedIndexChanged[\s\S]*?ViewMeeting\.aspx[\s\S]*?)<\/script>/i)?.[1];
  if (!scriptText) return null;

  const redirectTemplate =
    scriptText.match(/\/SB_Meetings\/ViewMeeting\.aspx\?S=\{?siteId\}?\&MID=\{?mid\}?/i)?.[0] ??
    "/SB_Meetings/ViewMeeting.aspx?S={siteId}&MID={mid}";

  return {
    handlerName: "OnClientSelectedIndexChanged",
    mode: "client-redirect",
    redirectTemplate,
    supportingFields: [
      "hdnSiteIDMeetings_UCs_MeetingDDL",
      "hdn_ChangeUrl_DMeetings_UCs_MeetingDDL",
      "ctl00_ContentPlaceHolder1_uc_MeetingDDL_radCombo_MeetingTypes",
      "ctl00_ContentPlaceHolder1_uc_MeetingDDL_radCombo_Meetings",
    ],
  };
};

const scanLinkedAssets = async (html, baseUrl, limit = 5) => {
  if (!baseUrl) return [];

  const srcs = extractScriptSrcs(html, baseUrl).slice(0, limit);
  const results = [];

  for (const src of srcs) {
    try {
      const text = await fetchText(src);
      const matches = unique([
        ...collectMatches(text, cluePatterns, src).map((match) => JSON.stringify(match)),
      ]).map((value) => JSON.parse(value));
      if (matches.length) {
        results.push({ source: src, matchCount: matches.length, matches });
      } else {
        results.push({ source: src, matchCount: 0, matches: [] });
      }
    } catch (error) {
      results.push({ source: src, error: error.message, matchCount: 0, matches: [] });
    }
  }

  return results;
};

export const discoverSimbliSource = async ({
  url,
  simbliId,
  siteId = DEFAULT_SITE_ID,
  html,
  repoContext,
}) => {
  const targetUrl = buildTargetUrl({ url, simbliId, siteId });
  const pageHtml = html ?? (targetUrl ? await fetchText(targetUrl) : "");
  const baseUrl = targetUrl ? new URL(targetUrl).origin : null;
  const title = extractTitle(pageHtml);
  const hiddenInputs = extractHiddenInputs(pageHtml);
  const forms = extractForms(pageHtml);
  const inlineClues = extractInlineClues(pageHtml);
  const selectionMechanism = detectSelectionMechanism(pageHtml);
  const linkedAssets = await scanLinkedAssets(pageHtml, baseUrl);

  const htmlMatches = unique([
    ...collectMatches(pageHtml, cluePatterns, "html").map((match) => JSON.stringify(match)),
  ]).map((value) => JSON.parse(value));

  const endpointCandidates = unique(
    [
      ...htmlMatches.map((match) => match.value),
      ...linkedAssets.flatMap((asset) => asset.matches?.map((match) => match.value) ?? []),
      ...hiddenInputs.map((input) => input.value).filter(Boolean),
    ].filter((value) =>
      /GetMeetingPermission|ViewMeeting\.aspx|\/Services\/api\/|\/api\/|postback|minute|agenda|meeting/i.test(
        value,
      ),
    ),
  );

  const exactMechanism = selectionMechanism
    ? "Client-side `OnClientSelectedIndexChanged` redirect to `ViewMeeting.aspx?S={siteId}&MID={mid}`"
    : endpointCandidates.find((value) => /GetMeetingPermission/i.test(value))
      ? "Permission/bootstrap call exposed in script"
      : endpointCandidates.length
        ? "Request path clue found in HTML/JS"
        : "No public request path found in shell HTML";

  const availableData = selectionMechanism
    ? [
        "Meeting selector state",
        "Redirect parameters (siteId, MID)",
        "Shell heading / breadcrumb context",
      ]
    : endpointCandidates.length
      ? ["Potential API/bootstrap request path", "Script-level request wiring"]
      : ["Shell-only public HTML"];

  const blockers = selectionMechanism
    ? [
        "Public HTML does not expose populated agenda/minutes content.",
        "Need the post-redirect request or hidden API call that hydrates the meeting view.",
      ]
    : [
        "No hidden request path identified yet.",
        "Need a browser network trace or a JS bundle path with live data fetches.",
      ];

  const nextAction = endpointCandidates.find((value) => /GetMeetingPermission/i.test(value))
    ? "Inspect the permission/bootstrap endpoint response, then replay the redirected page's network calls to locate the agenda/minutes payload."
    : selectionMechanism
      ? "Open the redirect target in a browser with network logging enabled and capture the first XHR/fetch call after the client redirect."
      : "Search the linked JS bundles for hidden API names, then capture the page in a browser devtools network trace.";

  const sampleClues = unique([
    ...htmlMatches.slice(0, 5).map((match) => `${match.source}: ${match.value}`),
    ...linkedAssets
      .flatMap((asset) => asset.matches?.slice(0, 2).map((match) => `${asset.source}: ${match.value}`) ?? [])
      .slice(0, 5),
    ...hiddenInputs.slice(0, 5).map(
      (input) => `hidden input: ${input.name}=${input.valuePreview ?? ""} (${input.valueLength} chars)`,
    ),
  ]);

  const summaryLines = [
    `Target: ${targetUrl ?? "(html only)"}`,
    `Title: ${title ?? "(none)"}`,
    `Mechanism: ${exactMechanism}`,
    `Available data: ${availableData.join(", ")}`,
    `Blockers: ${blockers.join(" ")}`,
    `Next action: ${nextAction}`,
  ];

  if (repoContext) {
    summaryLines.push(`Repo context: ${normalizeWhitespace(repoContext)}`);
  }

  const assetLines = linkedAssets.map((asset) => {
    if (asset.error) return `- ${asset.source} -> error: ${asset.error}`;
    return `- ${asset.source} -> ${asset.matchCount} clue(s)`;
  });

  return {
    textResultForLlm: [
      "Simbli source discovery",
      "",
      ...summaryLines,
      "",
      "Sample clues:",
      ...(sampleClues.length ? sampleClues.map((line) => `- ${line}`) : ["- none"]),
      "",
      "Linked JS assets:",
      ...(assetLines.length ? assetLines : ["- none"]),
      "",
      "Selection mechanism:",
      selectionMechanism ? JSON.stringify(selectionMechanism, null, 2) : "none",
      "",
      "Hidden inputs:",
      hiddenInputs.length ? JSON.stringify(hiddenInputs.slice(0, 10), null, 2) : "none",
      "",
      "Forms:",
      forms.length ? JSON.stringify(forms.slice(0, 10), null, 2) : "none",
      "",
      "Endpoint candidates:",
      endpointCandidates.length ? JSON.stringify(endpointCandidates, null, 2) : "none",
    ].join("\n"),
    resultType: "success",
  };
};
