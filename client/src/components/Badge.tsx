import type { ReactNode } from "react";

type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "blue" | "violet";

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

const toneClasses: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  blue: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
};

export const Badge = ({ tone = "slate", children, className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]} ${className}`}
  >
    {children}
  </span>
);
