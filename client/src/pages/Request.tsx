import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDistrictRequestCounts, createBoardCheckout, getBoardCheckoutSession, type BoardCheckoutSession } from "../api/hooks";

type ResidentForm = {
  boardName: string;
  state: string;
  submitterName: string;
  email: string;
};

type BoardPackageId = "community_request" | "founder_launch" | "founder_full_history";

const checkoutPackages: Array<{
  id: BoardPackageId;
  eyebrow: string;
  name: string;
  price: string;
  summary: string;
  bullets: string[];
}> = [
  {
    id: "community_request",
    eyebrow: "Community request",
    name: "Request page",
    price: "$25",
    summary: "Create a public funding page and validate community demand.",
    bullets: ["Public board request page", "$500 starter funding goal", "Best for citizen-led requests"],
  },
  {
    id: "founder_launch",
    eyebrow: "Direct service",
    name: "Founder Launch",
    price: "$1,500",
    summary: "Start a BoardVotes deployment with the five most recent years of records.",
    bullets: ["Initial dashboard deployment", "Vote extraction and scorecards", "12 months founder maintenance"],
  },
  {
    id: "founder_full_history",
    eyebrow: "Full archive",
    name: "Founder Launch + Full History",
    price: "$3,000",
    summary: "Launch with the full available historical archive backfilled.",
    bullets: ["Everything in Founder Launch", "Full available archive backfill", "Historical vote and ordinance index"],
  },
];

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
    answer: "Yes. Choose a service package on this page and Stripe will open a secure checkout. Stripe redirects back here with payment confirmation after checkout succeeds.",
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
  const [selectedPackageId, setSelectedPackageId] = useState<BoardPackageId>("founder_launch");
  const [residentLoading, setResidentLoading] = useState(false);
  const [residentError, setResidentError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BoardCheckoutSession | null>(null);
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const { data: counts, isLoading: countsLoading } = useDistrictRequestCounts();
  const selectedPackage = checkoutPackages.find((item) => item.id === selectedPackageId) ?? checkoutPackages[1];
  const searchParams = new URLSearchParams(window.location.search);
  const paymentCanceled = searchParams.get("canceled") === "1";
  const checkoutSuccess = searchParams.get("success") === "1";
  const checkoutSessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!checkoutSuccess || !checkoutSessionId) return;

    let canceled = false;
    setConfirmationLoading(true);
    setConfirmationError(null);

    getBoardCheckoutSession(checkoutSessionId)
      .then((session) => {
        if (!canceled) setConfirmation(session);
      })
      .catch(() => {
        if (!canceled) setConfirmationError("Payment completed, but the confirmation lookup is unavailable right now.");
      })
      .finally(() => {
        if (!canceled) setConfirmationLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [checkoutSuccess, checkoutSessionId]);

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
        packageId: selectedPackageId,
      });
      window.location.href = url;
    } catch (err: unknown) {
      const apiError =
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setResidentError(
        typeof apiError === "string"
          ? apiError
          : "Payment portal unavailable. Please try again or contact help@boardvotes.io.",
      );
      setResidentLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-24 sm:pb-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Start BoardVotes service</h1>
        <p className="mt-2 text-slate-500 text-sm">
          Choose a package, enter the board or governing body, and pay through the secure Stripe portal. BoardVotes confirms the payment after checkout succeeds.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Want the details first?{' '}
          <Link to="/faq" className="font-medium text-indigo-700 hover:text-indigo-800">
            Read the FAQ
          </Link>
          .
        </p>
      </header>

      {paymentCanceled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Checkout was canceled. No payment was recorded.
        </div>
      ) : null}

      {checkoutSuccess ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          {confirmationLoading ? (
            "Confirming payment with Stripe..."
          ) : confirmationError ? (
            confirmationError
          ) : confirmation?.paymentStatus === "paid" ? (
            <>
              Payment confirmed for {confirmation.packageName ?? "BoardVotes service"}
              {confirmation.amountTotal ? ` (${(confirmation.amountTotal / 100).toLocaleString("en-US", { style: "currency", currency: confirmation.currency ?? "USD" })})` : null}
              {confirmation.boardName ? ` for ${confirmation.boardName}` : null}.{" "}
              {confirmation.boardUrl ? (
                <a href={confirmation.boardUrl} className="font-medium underline hover:text-green-900">
                  View the BoardVotes page.
                </a>
              ) : null}
            </>
          ) : (
            `Stripe checkout returned with status ${confirmation?.status ?? "unknown"} and payment status ${confirmation?.paymentStatus ?? "unknown"}.`
          )}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">1. Select a request or service package</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">2. Enter the board and payer details</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">3. Pay through Stripe Checkout</li>
          <li className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">4. Receive payment confirmation and onboarding follow-up</li>
        </ol>
        <p className="mt-4 text-sm text-slate-500">
          Service packages begin onboarding directly. The $25 request option creates a public funding page when you want the community to help fund setup.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Payment portal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Package prices are enforced by the server. Stripe handles card entry, receipts, and the final payment confirmation.
          </p>
        </div>

        <form onSubmit={handleResidentSubmit} className="px-6 py-5 flex-1 flex flex-col space-y-4">
          <fieldset>
            <legend className={labelClass}>Package</legend>
            <div className="grid gap-3 lg:grid-cols-3">
              {checkoutPackages.map((pkg) => {
                const selected = selectedPackageId === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={
                      selected
                        ? "text-left rounded-lg border-2 border-indigo-600 bg-indigo-50 px-4 py-4 shadow-sm transition"
                        : "text-left rounded-lg border border-slate-200 bg-white px-4 py-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
                    }
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{pkg.eyebrow}</span>
                    <span className="mt-1 flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">{pkg.name}</span>
                      <span className="text-base font-bold text-slate-950">{pkg.price}</span>
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-slate-600">{pkg.summary}</span>
                    <span className="mt-3 block space-y-1">
                      {pkg.bullets.map((bullet) => (
                        <span key={bullet} className="block text-xs text-slate-500">• {bullet}</span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
          <p className="text-xs text-slate-500">
            After payment, Stripe redirects back here for confirmation. Any Stripe receipt configured for the account is sent to this email.
          </p>
          <div className="mt-auto pt-2">
            <button
              type="submit"
              disabled={residentLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {residentLoading ? "Opening Stripe…" : `Pay ${selectedPackage.price} for ${selectedPackage.name}`}
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
