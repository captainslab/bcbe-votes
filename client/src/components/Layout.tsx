import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { BoardVotesChat } from "./BoardVotesChat";

type LayoutProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/votes", label: "Votes" },
  { to: "/members", label: "Members" },
  { to: "/meetings", label: "Meetings" },
  { to: "/alliances", label: "Alliances" },
  { to: "/admin", label: "Admin" },
];

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#ffffff_38%,_#eef2ff_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <Link to="/" className="text-xl font-semibold tracking-tight text-slate-900">
              BCBE Votes
            </Link>
            <p className="text-sm text-slate-600">
              Public vote transparency for Baldwin County Board of Education.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-medium text-slate-600">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 transition ${
                    isActive ? "bg-slate-900 text-white shadow-sm" : "hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <BoardVotesChat />
    </div>
  );
};
