type StatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

export const StatCard = ({ label, value, helper }: StatCardProps) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
    <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-900 sm:mt-2 sm:text-2xl">{value}</p>
    {helper && <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">{helper}</p>}
  </div>
);
