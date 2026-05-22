import { Link } from "react-router-dom";

const FeatureIcon = ({ path }: { path: string }) => (
  <svg className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const features = [
  {
    iconPath: "M21 21l-4.35-4.35M11 19A8 8 0 1 0 11 3a8 8 0 0 0 0 16z",
    title: "Searchable meeting archive back to 2007",
    desc: "Every agenda, press packet, and minutes document indexed and full-text searchable.",
  },
  {
    iconPath: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    title: "Vote extraction and tracking",
    desc: "Ordinances, resolutions, and contested items extracted with named AYE / NAY records.",
  },
  {
    iconPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    title: "Council member voting scorecards and patterns",
    desc: "Per-member dissent rates, yes-rates, and alignment charts across extracted votes.",
  },
  {
    iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    title: "Ordinance and resolution tracking",
    desc: "Sequential numbering preserved — find any ordinance by number and trace its history.",
  },
  {
    iconPath: "M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zM10.3 21a1.94 1.94 0 0 0 3.4 0",
    title: "Agenda early-alert",
    desc: "New agendas flagged 2–4 days before each meeting so you never miss an action item.",
  },
  {
    iconPath: "M15 10l4.553-2.069A1 1 0 0 1 21 8.87V15.13a1 1 0 0 1-1.447.9L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z",
    title: "Video index — 463 council recordings",
    desc: "Every YouTube recording linked directly to its meeting record.",
  },
  {
    iconPath: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
    title: "AI-powered meeting summaries and categorization",
    desc: "Each meeting auto-categorized and summarized for fast triage.",
  },
  {
    iconPath: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    title: "Source-linked evidence for every extracted item",
    desc: "Every vote links back to its official agenda or minutes document.",
  },
  {
    iconPath: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    title: "Transcript-assisted meeting review",
    desc: "Auto-generated captions reviewed and tied to agenda items where available.",
  },
  {
    iconPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
    title: "Zoning and variance decision tracking",
    desc: "Land use, variance, and rezoning votes flagged and indexed by parcel detail.",
  },
];

const scanRows = [
  {
    source: "Council agendas / Press packets / Council minutes",
    cadence: "Bi-weekly",
    captures: "New documents, agenda items, vote adoptions",
    tier: "Included",
    tierClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    source: "Work sessions & special meetings / YouTube channel / Video captions",
    cadence: "Weekly",
    captures: "Video recordings, transcripts, work-session actions",
    tier: "Weekly Add-On",
    tierClass: "text-indigo-700 bg-indigo-50 border-indigo-200",
  },
  {
    source: "PDF & audio archive",
    cadence: "Each scan",
    captures: "Historical documents, older minutes, audio files",
    tier: "Data Add-On",
    tierClass: "text-slate-700 bg-slate-50 border-slate-200",
  },
];

const timelineSteps = [
  {
    range: "Days 1–2",
    title: "Source ingestion setup",
    desc: "Fairhope city website, YouTube channel, and archive sources are connected and validated.",
  },
  {
    range: "Days 3–5",
    title: "Vote extraction and indexing",
    desc: "Ordinance adoptions, resolutions, and named votes extracted and structured.",
  },
  {
    range: "Days 5–7",
    title: "Dashboard launch",
    desc: "fcc.boardvotes.io goes live with the extracted record set and all public features enabled.",
  },
  {
    range: "Days 7–30",
    title: "Historical backfill + payment portal",
    desc: "Full archive tier: documents back to 2007 are ingested. Stripe subscription portal configured.",
  },
];

export const Proposal = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      {/* Page header — dark slate hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 shadow-2xl sm:p-10">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative">
          <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
            BoardVotes.io — Service Proposal
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Fairhope City Council
          </h1>
          <p className="mt-2 text-indigo-300 text-base font-medium">
            Proposal prepared for Chris McNeil
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200">
              <span className="text-slate-400">URL</span>
              <span>fcc.boardvotes.io</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200">
              <span className="text-slate-400">Prepared</span>
              <span>May 2026</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200">
              <span className="text-slate-400">Entity</span>
              <span>Fairhope, Alabama City Council</span>
            </span>
          </div>
        </div>
      </section>

      {/* What BoardVotes Does */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What BoardVotes Does</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          BoardVotes builds a permanent, searchable public record of how a governing body votes — extracted directly
          from official agendas, minutes, and meeting recordings. Every vote item is source-linked, every council
          member gets a scorecard, and every document in the archive is indexed and full-text searchable. The result
          is a civic transparency platform that journalists, residents, and researchers can use without filing a
          records request.
        </p>
      </section>

      {/* What's Included — feature grid */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What's Included</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <FeatureIcon path={f.iconPath} />
              <div>
                <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Verified Data Coverage */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Verified Data Coverage</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-l-4 border-l-indigo-400 border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-2xl font-bold text-slate-900">~1,200+</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">Documents</p>
            <p className="mt-1 text-xs text-slate-500">Agendas, press packets, and minutes — back to January 8, 2007</p>
          </div>
          <div className="rounded-lg border border-l-4 border-l-indigo-400 border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-2xl font-bold text-slate-900">463</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">Council Meeting Recordings</p>
            <p className="mt-1 text-xs text-slate-500">YouTube, back to October 2016 — auto-generated transcripts confirmed</p>
          </div>
          <div className="rounded-lg border border-l-4 border-l-emerald-400 border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">Named AYE / NAY Votes Confirmed</p>
            <p className="mt-1 text-xs text-slate-500">
              Ordinance adoptions captured with named votes. Routine unanimous motions recorded as voice-vote only
              per Fairhope minutes format.
            </p>
          </div>
          <div className="rounded-lg border border-l-4 border-l-sky-400 border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">
              Ordinance No. 1780 · 1781 — Live Demo
            </p>
            <p className="mt-1 text-xs text-slate-500 mb-2">
              One real Fairhope City Council meeting is already imported and live.
            </p>
            <a
              href="https://fcc.boardvotes.io/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800 underline underline-offset-2"
            >
              View at fcc.boardvotes.io/dashboard →
            </a>
          </div>
        </div>
      </section>

      {/* Founder Pricing */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Founder Pricing</h2>
        <p className="mt-1 text-sm text-slate-500">Direct-service rates for the initial deployment.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Founder Launch — featured */}
          <div className="relative flex flex-col rounded-xl border-2 border-indigo-600 bg-indigo-50 p-6 shadow-md">
            <span className="inline-flex self-start rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white mb-3">
              Recommended
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Founder Launch</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">$1,500</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 flex-1">
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> 5-year archive (2021 – present)</li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> Vote extraction and scorecards</li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> All 10 included features</li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> 12 months founder maintenance</li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> fcc.boardvotes.io deployment</li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold">✓</span> Stripe subscription portal</li>
            </ul>
            <Link
              to="/request?package=founder_launch"
              className="mt-6 inline-block rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 text-sm font-semibold text-center transition"
            >
              Get Started — $1,500 →
            </Link>
          </div>

          {/* Founder Launch + Full History */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Full Archive</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">Founder Launch + Full History</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">$3,000</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 flex-1">
              <li className="flex gap-2"><span className="text-slate-400 font-bold">✓</span> Everything in Founder Launch</li>
              <li className="flex gap-2"><span className="text-slate-400 font-bold">✓</span> Archive back to January 8, 2007</li>
              <li className="flex gap-2"><span className="text-slate-400 font-bold">✓</span> ~1,200+ historical documents ingested</li>
              <li className="flex gap-2"><span className="text-slate-400 font-bold">✓</span> Historical vote and ordinance index</li>
              <li className="flex gap-2"><span className="text-slate-400 font-bold">✓</span> 463 recordings linked</li>
            </ul>
            <Link
              to="/request?package=founder_full_history"
              className="mt-6 inline-block rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 px-5 py-3 text-sm font-semibold text-center transition"
            >
              Get Started — $3,000 →
            </Link>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          12 months of maintenance included with both packages. Ongoing maintenance is $200/month after the first year.
        </p>
      </section>

      {/* Optional Add-Ons */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Optional Add-Ons</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Weekly Expanded Scan</p>
            <p className="mt-1 text-xl font-bold text-slate-900">$150<span className="text-sm font-normal text-slate-500">/month</span></p>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Weekly YouTube and work-session sweep, transcript ingestion, and caption extraction for all new recordings.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Data Ownership Package</p>
            <p className="mt-1 text-xl font-bold text-slate-900">$100<span className="text-sm font-normal text-slate-500">/month</span></p>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Monthly structured export of all extracted data in JSON and CSV. Full portability — your data, on your terms.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Planning & Zoning Expansion</p>
            <p className="mt-1 text-xl font-bold text-slate-900">Contact</p>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Deep zoning and variance tracking with parcel-level detail, applicant names, and decision history indexed.
            </p>
          </div>
        </div>
      </section>

      {/* How Updates Work — scan schedule table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">How Updates Work</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Cadence</th>
                <th className="px-4 py-2 hidden sm:table-cell">What's Captured</th>
                <th className="px-4 py-2">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scanRows.map((row) => (
                <tr key={row.source} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800 text-xs leading-snug">{row.source}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs whitespace-nowrap">{row.cadence}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs hidden sm:table-cell">{row.captures}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${row.tierClass}`}>
                      {row.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Agendas captured within 1–3 days of posting. Minutes ingested within one scan cycle of publication —
          Fairhope publishes minutes within 35 days of each meeting.
        </p>
      </section>

      {/* What Happens After You Pay — timeline */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What Happens After You Pay</h2>
        <div className="mt-4 space-y-3">
          {timelineSteps.map((step, i) => (
            <div
              key={step.range}
              className="flex gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {i + 1}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step.range}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live Demo CTA */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 shadow-2xl sm:p-10 text-center">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">View the Live Demo</h2>
          <p className="mt-3 text-slate-300 text-sm max-w-lg mx-auto">
            One real Fairhope City Council meeting is already imported. See exactly what your platform will look like.
          </p>
          <a
            href="https://fcc.boardvotes.io/dashboard"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 text-sm font-semibold transition shadow-lg"
          >
            Open fcc.boardvotes.io →
          </a>
        </div>
      </section>
    </div>
  );
};
