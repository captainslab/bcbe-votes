type StatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

export const StatCard = ({ label, value, helper }: StatCardProps) => (
  <div className="rounded-xl border border-slate-200 border-t-4 border-t-indigo-500 bg-white p-4 shadow-sm hover:shadow-md transition-shadow sm:p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
  </div>
);
