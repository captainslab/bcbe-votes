import { useState } from "react";
import { Link } from "react-router-dom";
import { useDistrictRequestCounts, createBoardCheckout } from "../api/hooks";

type ResidentForm = {
  boardName: string;
  state: string;
  submitterName: string;
  email: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";

const faqItems = [
  {
    question: "What does the $25 cover?",
    answer: "It creates a public funding page for the requested board and helps filter serious requests from spam.",
  },
  {
    question: "What happens when a board reaches $500?",
    answer: "BoardVotes.io begins source review and onboarding. That includes checking public records, meeting history, available minutes, agendas, and vote documentation. $500 is our starting goal — actual setup cost may vary depending on the board, and each request is reviewed case by case.",
  },
  {
    question: "What if the public records are incomplete?",
    answer: "Some boards do not publish enough usable information to support full vote tracking. If that happens, the board page may show limited coverage, source gaps, or a needs-review status.",
  },
  {
    question: "Can an organization pay directly instead of crowdfunding?",
    answer: "Yes. Organizations that want direct onboarding can contact BoardVotes.io to discuss setup options.",
  },
  {
    question: "Can HOAs or private boards use this?",
    answer: "Yes, but private or member-only bodies may require a different access model. Public crowdfunding is best for public boards and governing bodies.",
  },
] as const;

export const Request = () => {
  const [residentForm, setResidentForm] = useState<ResidentForm>({
    boardName: "",
    state: "",
    submitterName: "",
    email: "",
  });
  const [residentLoading, setResidentLoading] = useState(false);
  const [residentError, setResidentError] = useState<string | null>(null);

  const { data: counts, isLoading: countsLoading } = useDistrictRequestCounts();

  const handleResidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResidentLoading(true);
    setResidentError(null);
    try {
      const { url } = await createBoardCheckout({
        boardName: residentForm.boardName,
        state: residentForm.state,
        submitterName: residentForm.submitterName,
        submitterEmail: residentForm.email,
      });
      window.location.href = url;
    } catch {
      setResidentError("Something went wrong. Please try again.");
      setResidentLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 sm:pb-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Bring BoardVotes to Your Organization</h1>
        <p className="mt-2 text-slate-500 text-sm">
          BoardVotes tracks any board or governing body — school boards, HOAs, city councils, water districts, library boards, and more. Request your organization or list your board to work with us directly.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Want the details first?{' '}
          <Link to="/faq" className="font-medium text-indigo-700 hover:text-indigo-800">
            Read the FAQ
          </Link>
          .
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">1. Submit your board</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">2. Share the funding page</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">3. Community pledges toward the setup goal</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">4. We review sources and begin onboarding once funded</li>
        </ol>
        <p className="mt-4 text-sm text-slate-500">
          Funding starts the onboarding review. If public records are usable, we build the board page and begin publishing tracked records. Some boards may have incomplete, inconsistent, or unavailable source material.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Request your board</h2>
          <p className="mt-1 text-sm text-slate-500">
            The $25 submission helps verify demand and prevent spam requests. Others can pledge toward the $500 starting goal.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            When $500 is reached, we begin reviewing public records, source availability, meeting history, and board setup. Each request is evaluated case by case — $500 is a starting point and actual costs may vary.
          </p>
        </div>

        <form onSubmit={handleResidentSubmit} className="px-6 py-5 flex-1 flex flex-col space-y-4">
          <div>
            <label className={labelClass}>Board / body name</label>
            <input
              type="text"
              required
              value={residentForm.boardName}
              onChange={(e) => setResidentForm((f) => ({ ...f, boardName: e.target.value }))}
              placeholder="e.g. Riverside HOA, Jefferson County Water Board"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              type="text"
              required
              value={residentForm.state}
              onChange={(e) => setResidentForm((f) => ({ ...f, state: e.target.value }))}
              placeholder="e.g. AL"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Your name</label>
            <input
              type="text"
              required
              value={residentForm.submitterName}
              onChange={(e) => setResidentForm((f) => ({ ...f, submitterName: e.target.value }))}
              placeholder="Full name"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Your email</label>
            <input
              type="email"
              required
              value={residentForm.email}
              onChange={(e) => setResidentForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          {residentError && <p className="text-xs text-red-600">{residentError}</p>}
          <p className="text-xs text-slate-500">After payment, your board request page can be shared with others.</p>
          <div className="mt-auto pt-2">
            <button
              type="submit"
              disabled={residentLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {residentLoading ? "Redirecting to payment…" : "Submit for $25"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">FAQ</h2>
        <div className="mt-4 space-y-4 text-sm text-slate-600">
          {faqItems.map((item) => (
            <div key={item.question} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-semibold text-slate-900">{item.question}</p>
              <p className="mt-1">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Most requested boards</h2>
        </div>
        <div className="px-6 py-5">
          {countsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 bg-slate-100 rounded animate-pulse w-2/3" />
              ))}
            </div>
          ) : !counts || counts.length === 0 ? (
            <p className="text-sm text-slate-500">Be the first to request a board.</p>
          ) : (
            <ol className="space-y-2">
              {counts.map((item, i) => (
                <li key={`${item.boardName}-${item.state}`} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="w-6 text-right font-semibold text-slate-400">{i + 1}.</span>
                  <span>
                    {item.boardName} — {item.state} — {item.count} {item.count === 1 ? "request" : "requests"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <p className="text-xs text-slate-400">
        BoardVotes.io is an independent project. Your email will only be used to notify you about your requested board or governing body.{' '}
        <Link to="/contact" className="underline hover:text-slate-600">
          Questions? Contact us.
        </Link>
      </p>
    </div>
  );
};
