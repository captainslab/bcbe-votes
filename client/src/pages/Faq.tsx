import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const sections: { title: string; items: { question: string; answer: ReactNode }[] }[] = [
  {
    title: "About BoardVotes.io",
    items: [
      {
        question: "What is BoardVotes.io, and why does it exist?",
        answer: (
          <p>
            BoardVotes.io exists because public meeting information is technically public but often hard for normal people to find, understand, and compare. The site organizes public records into searchable meetings, vote items, categories, source links, and member vote profile records so visitors can follow what happened without digging through portals, PDFs, agendas, livestreams, and attachments for hours.
          </p>
        ),
      },
      {
        question: "Is BoardVotes.io official?",
        answer: (
          <p>
            No. BoardVotes.io is an independent public-records site. It is not a government office, not part of a school system, and not an official board channel.
          </p>
        ),
      },
    ],
  },
  {
    title: "Public records and funding",
    items: [
      {
        question: "If the records are public, what are people paying for?",
        answer: (
          <p>
            People are not paying for access to public records. They are paying to make public records usable. BoardVotes.io collects, organizes, searches, summarizes, categorizes, and source-links records that would otherwise require manual digging through meeting portals, PDFs, agendas, livestreams, and attachments.
          </p>
        ),
      },
      {
        question: "What does the $25 board request fee cover?",
        answer: (
          <p>
            The $25 fee creates a public funding page for the requested board and helps filter serious requests from spam. It starts the request process but does not change vote outcomes or guarantee every board can be fully tracked.
          </p>
        ),
      },
      {
        question: "What happens when a board reaches the funding goal?",
        answer: (
          <p>
            Once a board reaches the funding goal, BoardVotes.io reviews available public records, checks source quality, and begins onboarding if the records are usable. If the source material is weak or incomplete, the page may show limited coverage or review status instead of pretending the record set is complete.
          </p>
        ),
      },
      {
        question: "If this information is public, why would anyone pay?",
        answer: (
          <p>
            People are not paying for access to public records. They are paying to make public records usable. BoardVotes.io collects, organizes, searches, summarizes, categorizes, and source-links records that would otherwise require manual digging through meeting portals, PDFs, agendas, livestreams, and attachments.
          </p>
        ),
      },
    ],
  },
  {
    title: "Member profiles and voting data",
    items: [
      {
        question: "What are member vote profile records?",
        answer: (
          <div className="space-y-3">
            <p>
              <strong>Member vote profile records</strong> are source-linked factual summaries built over time for each member. They are not claims about motive, ideology, or character.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>recorded votes</li>
              <li>yes/no/abstain counts where individual records exist</li>
              <li>vote categories</li>
              <li>meeting participation where source data supports it</li>
              <li>source-linked voting history</li>
              <li>voting alignment patterns</li>
              <li>topic and category trends</li>
            </ul>
          </div>
        ),
      },
      {
        question: "What can member profiles show?",
        answer: (
          <p>
            Member profiles can show factual voting history, counts, categories, participation when source data supports it, and alignment patterns across recorded items. They should be read as record summaries, not biographies or motive statements.
          </p>
        ),
      },
      {
        question: "Does BoardVotes.io explain why someone voted a certain way?",
        answer: (
          <p>
            No. BoardVotes.io can show what was recorded and how the vote appeared in the source material. It does not claim to know a member’s motive unless a source record explicitly states it.
          </p>
        ),
      },
      {
        question: "Does BoardVotes.io tell people who to vote for?",
        answer: (
          <p>
            No. BoardVotes.io is a transparency and record-keeping site. It does not provide political persuasion or voting instructions.
          </p>
        ),
      },
      {
        question: "What does Voting Alignment mean?",
        answer: (
          <p>
            Voting Alignment is a descriptive measure of how often members vote the same way on the same recorded items. It is a pattern in the record, not an endorsement, ideology label, or character judgment.
          </p>
        ),
      },
    ],
  },
  {
    title: "Source quality and limitations",
    items: [
      {
        question: "What does source-linked mean?",
        answer: (
          <p>
            Source-linked means the page includes a link or reference back to the public record that supports the item, vote, or summary.
          </p>
        ),
      },
      {
        question: "What does Verified mean?",
        answer: (
          <p>
            Verified means the record was checked against the available source material and the site has enough evidence to present it as a factual match.
          </p>
        ),
      },
      {
        question: "What does Needs Review mean?",
        answer: (
          <p>
            Needs Review means the source material is incomplete, unclear, inconsistent, or too weak to treat the item as fully confirmed. It is a warning, not a guess dressed up as certainty.
          </p>
        ),
      },
      {
        question: "What if a board’s records are incomplete or hard to use?",
        answer: (
          <p>
            Some boards publish records that are incomplete, inconsistent, or difficult to work with. In those cases, BoardVotes.io may show partial coverage, source gaps, or review markers instead of pretending the board is fully tracked.
          </p>
        ),
      },
    ],
  },
  {
    title: "Future plans",
    items: [
      {
        question: "What are future plans for the site?",
        answer: (
          <div className="space-y-3">
            <p>Possible future updates may include:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>better search across agenda text and attachments</li>
              <li>improved summaries</li>
              <li>personnel and action-detail extraction where source records support it</li>
              <li>stronger member vote profile pages</li>
              <li>category analytics</li>
              <li>better source quality indicators</li>
              <li>more board and governing body types</li>
              <li>city councils</li>
              <li>county commissions</li>
              <li>water districts</li>
              <li>library boards</li>
              <li>HOAs and private or member-only bodies with a different access model</li>
              <li>chatbot data analysis tools grounded in site data</li>
            </ul>
            <p>These are possible updates, not guarantees.</p>
          </div>
        ),
      },
      {
        question: "Can BoardVotes.io expand beyond school boards?",
        answer: (
          <p>
            Yes, that is a possible direction. The platform may expand to other governing bodies if the source material and access model make sense.
          </p>
        ),
      },
      {
        question: "Can HOAs or private boards use BoardVotes.io?",
        answer: (
          <p>
            Yes, but private or member-only bodies may require a different access model. Public crowdfunding works best for public boards and other open governing bodies.
          </p>
        ),
      },
    ],
  },
  {
    title: "Corrections and support",
    items: [
      {
        question: "How do people report corrections or request updates?",
        answer: (
          <div className="space-y-3">
            <p>
              If something appears wrong, send the meeting date, vote item title, source link if available, and a short explanation to <a href="mailto:help@boardvotes.io" className="font-semibold text-indigo-700 hover:text-indigo-800">help@boardvotes.io</a>.
            </p>
            <p>
              Clear source details help fix the record faster.
            </p>
          </div>
        ),
      },
    ],
  },
];

export const Faq = () => {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">FAQ</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">BoardVotes.io FAQ</h1>
            <p className="text-base leading-7 text-slate-600">
              Clear answers about public records, funding, member profiles, source quality, and what this site can and cannot claim.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link to="/request" className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 transition">
              Add a Board
            </Link>
            <Link to="/support" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 font-medium text-slate-800 hover:bg-slate-100 transition">
              Support
            </Link>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="space-y-4 rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8">
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <div className="space-y-4">
            {section.items.map((item) => (
              <article key={item.question} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <h3 className="text-base font-semibold leading-6 text-slate-900">{item.question}</h3>
                <div className="mt-2 space-y-3 text-sm leading-6 text-slate-600">{item.answer}</div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-6 shadow-sm sm:px-8">
        <h2 className="text-lg font-semibold text-slate-900">Need a quick next step?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Browse <Link to="/meetings" className="font-semibold text-indigo-700 hover:text-indigo-800">meetings</Link>, check <Link to="/members" className="font-semibold text-indigo-700 hover:text-indigo-800">member profiles</Link>, or send corrections to <a href="mailto:help@boardvotes.io" className="font-semibold text-indigo-700 hover:text-indigo-800">help@boardvotes.io</a>.
        </p>
      </section>
    </div>
  );
};
