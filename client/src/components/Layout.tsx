import { Link, NavLink, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { navItems, hubNavItems } from "./navConfig";
import { useBoardContext } from "../context/BoardContext";

type LayoutProps = {
  children?: ReactNode;
};

function isHubDomain(): boolean {
  const h = window.location.hostname;
  return h === "boardvotes.io" || h === "www.boardvotes.io" || h === "localhost";
}

export const Layout = ({ children }: LayoutProps) => {
  const hubMode = isHubDomain();
  const activeNavItems = hubMode ? hubNavItems : navItems;
  const { boardName } = useBoardContext();

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
              {hubMode
                ? "School board transparency, everywhere"
                : `Public vote records · ${boardName}`}
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {activeNavItems.map((item) => (
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
            BoardVotes.io — Independent public records. Not an official government site.
          </p>
          <nav className="flex gap-4 text-xs">
            {hubMode ? (
              <>
                <Link to="/boards" className="hover:text-white transition">Boards</Link>
                <Link to="/request" className="hover:text-white transition">Request a Board</Link>
                <Link to="/faq" className="hover:text-white transition">FAQ</Link>
                <Link to="/contact" className="hover:text-white transition">Contact</Link>
                <a href="mailto:help@boardvotes.io" className="hover:text-white transition">help@boardvotes.io</a>
              </>
            ) : (
              <>
                <Link to="/votes" className="hover:text-white transition">Votes</Link>
                <Link to="/members" className="hover:text-white transition">Members</Link>
                <Link to="/meetings" className="hover:text-white transition">Meetings</Link>
                <Link to="/boards" className="hover:text-white transition">Fund a Board</Link>
                <Link to="/support" className="hover:text-white transition">Support</Link>
                <a href="mailto:help@boardvotes.io" className="hover:text-white transition">help@boardvotes.io</a>
                <Link to="/contact" className="hover:text-white transition">Contact</Link>
              </>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
};
