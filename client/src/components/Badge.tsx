import type { ReactNode } from "react";

type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "blue";

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

const toneClasses: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
};

export const Badge = ({ tone = "slate", children, className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]} ${className}`}
  >
    {children}
  </span>
);
