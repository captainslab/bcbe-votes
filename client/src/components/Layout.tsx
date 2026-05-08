import { Link, NavLink, Outlet } from "react-router-dom";
import type { ReactNode } from "react";

type LayoutProps = {
  children?: ReactNode;
};

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/votes", label: "Votes" },
  { to: "/members", label: "Members" },
  { to: "/meetings", label: "Meetings" },
  { to: "/alliances", label: "Alliances" },
];

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <div className="h-[3px] bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500" />
      <header className="bg-slate-950 sticky top-0 z-50 shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <Link to="/" className="text-xl font-bold tracking-tight text-white">
              BoardVotes<span className="text-indigo-400">.io</span>
            </Link>
            <p className="text-xs text-slate-400">
              Public vote records · Baldwin County Board of Education
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive
                    ? "bg-indigo-600 text-white rounded-md px-3 py-1.5 text-sm font-medium"
                    : "text-slate-400 hover:text-white hover:bg-white/10 rounded-md px-3 py-1.5 text-sm font-medium transition"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl w-full px-6 py-8 flex-1">{children ?? <Outlet />}</main>
      <footer className="bg-slate-900 text-slate-400 mt-auto">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">
            BoardVotes.io — Independent public records. Not an official Baldwin County government site.
          </p>
          <nav className="flex gap-4 text-xs">
            <Link to="/votes" className="hover:text-white transition">Votes</Link>
            <Link to="/members" className="hover:text-white transition">Members</Link>
            <Link to="/meetings" className="hover:text-white transition">Meetings</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};
