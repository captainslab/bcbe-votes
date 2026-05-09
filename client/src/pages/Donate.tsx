import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createDonationCheckout } from "../api/hooks";

const presetAmounts = [5, 10, 25, 50, 100];

export const Donate = () => {
  const [searchParams] = useSearchParams();
  const [selectedAmount, setSelectedAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    const parsed = Number(customAmount);
    return customAmount.trim() ? parsed : selectedAmount;
  }, [customAmount, selectedAmount]);

  const handlePresetClick = (value: number) => {
    setSelectedAmount(value);
    setCustomAmount("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
      setError("Enter a whole-dollar amount between $1 and $10,000.");
      return;
    }

    setIsLoading(true);
    try {
      const { url } = await createDonationCheckout({
        amount,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      window.location.href = url;
    } catch {
      setError("Payment could not be started. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support BoardVotes.io</h1>
        <p className="mt-2 text-sm text-slate-500">
          Leave a one-time tip to help keep public meeting and vote records easier to find, read, and verify.
        </p>
      </div>

      {searchParams.get("success") === "1" ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          Thank you for supporting BoardVotes.io.
        </div>
      ) : null}

      {searchParams.get("canceled") === "1" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Payment was canceled. Nothing was charged.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">One-time tip</h2>
            <p className="mt-1 text-sm text-slate-500">
              Payments are processed through Stripe. Choose an amount and continue to checkout.
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Amount</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {presetAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handlePresetClick(value)}
                    className={
                      customAmount === "" && selectedAmount === value
                        ? "rounded-lg border-2 border-indigo-600 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
                        : "rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition"
                    }
                  >
                    ${value}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Custom whole-dollar amount"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email receipt</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {error ? <p className="text-xs text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {isLoading ? "Opening Stripe..." : `Tip $${Number.isFinite(amount) ? amount : selectedAmount}`}
            </button>
          </div>
        </form>

        <aside className="rounded-xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-900">What tips support</h2>
          <ul className="mt-3 space-y-2">
            <li>Source-linked vote records</li>
            <li>Public access to meeting history</li>
            <li>Hosting and maintenance</li>
            <li>Careful review of extracted data</li>
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            BoardVotes.io is independent and is not affiliated with Baldwin County Schools or any government body.
          </p>
        </aside>
      </div>
    </div>
  );
};
