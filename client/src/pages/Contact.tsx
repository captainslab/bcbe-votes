import { useState } from "react";

type IssueType = "data-error" | "missing-vote" | "member-info" | "suggestion" | "press" | "other";

type Template = {
  label: string;
  description: string;
  subject: string;
  fields: { id: string; label: string; placeholder: string; multiline?: boolean }[];
  bodyFn: (values: Record<string, string>) => string;
};

const TEMPLATES: Record<IssueType, Template> = {
  "data-error": {
    label: "Incorrect vote record",
    description: "A vote is misattributed, has the wrong outcome, or contains bad data.",
    subject: "Data error report — BoardVotes.io",
    fields: [
      { id: "meeting", label: "Meeting date", placeholder: "e.g. March 4, 2025" },
      { id: "vote", label: "Vote / agenda item", placeholder: "e.g. Budget amendment #3" },
      { id: "member", label: "Board member (if applicable)", placeholder: "e.g. Ken Bradley" },
      { id: "what", label: "What's wrong", placeholder: "Describe the error and what the correct information should be", multiline: true },
    ],
    bodyFn: (v) =>
      `Meeting date: ${v.meeting || "—"}\nVote / agenda item: ${v.vote || "—"}\nBoard member: ${v.member || "—"}\n\nWhat's wrong:\n${v.what || "—"}`,
  },
  "missing-vote": {
    label: "Missing vote or meeting",
    description: "A meeting or vote that should appear in the database is absent.",
    subject: "Missing vote/meeting — BoardVotes.io",
    fields: [
      { id: "meeting", label: "Meeting date", placeholder: "e.g. January 14, 2025" },
      { id: "vote", label: "Vote or agenda item", placeholder: "Describe the item that's missing" },
      { id: "source", label: "Source URL (if you have one)", placeholder: "https://..." },
    ],
    bodyFn: (v) =>
      `Meeting date: ${v.meeting || "—"}\nMissing item: ${v.vote || "—"}\nSource: ${v.source || "—"}`,
  },
  "member-info": {
    label: "Board member info issue",
    description: "A member's name, role, or district is wrong or out of date.",
    subject: "Board member info — BoardVotes.io",
    fields: [
      { id: "member", label: "Board member name", placeholder: "e.g. April Bradley" },
      { id: "what", label: "What needs to change", placeholder: "Describe the correction", multiline: true },
    ],
    bodyFn: (v) =>
      `Board member: ${v.member || "—"}\n\nCorrection needed:\n${v.what || "—"}`,
  },
  suggestion: {
    label: "Feature suggestion",
    description: "An idea for a new page, filter, chart, or other improvement.",
    subject: "Feature suggestion — BoardVotes.io",
    fields: [
      { id: "idea", label: "Your idea", placeholder: "Describe what you'd like to see", multiline: true },
      { id: "why", label: "Why it would be useful", placeholder: "Who benefits and how?", multiline: true },
    ],
    bodyFn: (v) =>
      `Idea:\n${v.idea || "—"}\n\nWhy it's useful:\n${v.why || "—"}`,
  },
  press: {
    label: "Press / media inquiry",
    description: "Journalist, researcher, or public records request.",
    subject: "Press inquiry — BoardVotes.io",
    fields: [
      { id: "org", label: "Publication or organization", placeholder: "e.g. AL.com, independent researcher" },
      { id: "topic", label: "Topic", placeholder: "What are you covering?" },
      { id: "deadline", label: "Deadline (if any)", placeholder: "e.g. May 15, 2025" },
    ],
    bodyFn: (v) =>
      `Organization: ${v.org || "—"}\nTopic: ${v.topic || "—"}\nDeadline: ${v.deadline || "—"}`,
  },
  other: {
    label: "Other",
    description: "Anything else — general questions, feedback, or hello.",
    subject: "Message — BoardVotes.io",
    fields: [
      { id: "message", label: "Message", placeholder: "What's on your mind?", multiline: true },
    ],
    bodyFn: (v) => v.message || "",
  },
};

const ISSUE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: "data-error", label: "Incorrect vote record" },
  { value: "missing-vote", label: "Missing vote or meeting" },
  { value: "member-info", label: "Board member info issue" },
  { value: "suggestion", label: "Feature suggestion" },
  { value: "press", label: "Press / media inquiry" },
  { value: "other", label: "Other" },
];

export const Contact = () => {
  const [issueType, setIssueType] = useState<IssueType>("data-error");
  const [values, setValues] = useState<Record<string, string>>({});

  const template = TEMPLATES[issueType];

  const handleTypeChange = (type: IssueType) => {
    setIssueType(type);
    setValues({});
  };

  const handleField = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const mailtoHref = () => {
    const body = template.bodyFn(values);
    return `mailto:help@boardvotes.io?subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contact</h1>
        <p className="mt-2 text-slate-500 text-sm">
          BoardVotes.io is an independent project. Use the form below to reach us at{" "}
          <a href="mailto:help@boardvotes.io" className="text-indigo-600 hover:underline">
            help@boardvotes.io
          </a>
          .
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Issue type selector */}
        <div className="px-6 py-5 border-b border-slate-100">
          <label className="block text-sm font-semibold text-slate-700 mb-3">What's this about?</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ISSUE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleTypeChange(opt.value)}
                className={
                  issueType === opt.value
                    ? "rounded-lg border-2 border-indigo-600 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 text-left transition"
                    : "rounded-lg border-2 border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 text-left hover:border-slate-300 hover:bg-slate-50 transition"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">{template.description}</p>
        </div>

        {/* Dynamic fields */}
        <div className="px-6 py-5 space-y-4">
          {template.fields.map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
              {field.multiline ? (
                <textarea
                  rows={3}
                  value={values[field.id] ?? ""}
                  onChange={(e) => handleField(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={values[field.id] ?? ""}
                  onChange={(e) => handleField(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Opens your email client with the message pre-filled.
          </p>
          <a
            href={mailtoHref()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition whitespace-nowrap"
          >
            Open in email
          </a>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        BoardVotes.io is not affiliated with or endorsed by Baldwin County Schools or any government body. All data is
        sourced from publicly available meeting minutes and board agendas.
      </p>
    </div>
  );
};
