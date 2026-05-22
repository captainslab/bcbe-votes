type NavItem =
  | { to: string; label: string; bcbeOnly?: boolean; fccOnly?: boolean; href?: never }
  | { href: string; label: string; bcbeOnly?: boolean; fccOnly?: boolean; to?: never };

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/members", label: "Members" },
  { to: "/votes", label: "Votes" },
  { to: "/meetings", label: "Meetings" },
  { to: "/exec-sessions", label: "Exec Sessions", bcbeOnly: true },
  { to: "/transcripts", label: "Transcripts" },
  { to: "/vendors", label: "Vendors" },
  { to: "/alliances", label: "Alliances" },
  { to: "/request", label: "Add a Board" },
  { to: "/faq", label: "FAQ" },
  { to: "/support", label: "Support" },
  { to: "/proposal", label: "Proposal", fccOnly: true },
];

export const hubNavItems: NavItem[] = [
  { to: "/", label: "Home" },
  { to: "/boards", label: "Boards" },
  { to: "/request", label: "Request" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];
