import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { navItems, hubNavItems } from "../components/navConfig";
import { useHubBoards } from "../api/hooks";
import type { Board } from "../types";
import "./Landing.css";

function isHubDomain(): boolean {
  const h = window.location.hostname;
  return h === "boardvotes.io" || h === "www.boardvotes.io" || h === "localhost";
}

function BoardStatusBadge({ status }: { status: Board["status"] }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
        Live
      </span>
    );
  }
  if (status === "onboarding") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 inline-block" />
        Onboarding
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 inline-block" />
      Coming Soon
    </span>
  );
}

function BoardCard({ board }: { board: Board }) {
  const isLive = board.status === "live";
  const cardClass = isLive
    ? "board-hub-card board-hub-card-live"
    : "board-hub-card board-hub-card-muted";

  const inner = (
    <div className={cardClass}>
      <div className="board-hub-card-header">
        <div className="board-hub-card-meta">
          <span className="board-hub-card-state">{board.state}</span>
          <BoardStatusBadge status={board.status} />
        </div>
        {isLive && (
          <svg className="board-hub-card-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        )}
      </div>
      <p className="board-hub-card-name">{board.name}</p>
      {board.description && (
        <p className="board-hub-card-desc">{board.description}</p>
      )}
    </div>
  );

  if (isLive) {
    // Link to subdomain only if we're already on a subdomain (it's wired up),
    // otherwise fall back to the dashboard on the current origin
    const onSubdomain = /^[^.]+\.boardvotes\.io$/.test(window.location.hostname);
    const href = onSubdomain
      ? `https://${board.slug}.boardvotes.io`
      : `/dashboard`;
    const isExternal = onSubdomain;
    return (
      <a href={href} {...(isExternal ? { rel: "noopener noreferrer" } : {})}>
        {inner}
      </a>
    );
  }
  return <div>{inner}</div>;
}

function BoardSelectorSection() {
  const { data: boards, isLoading } = useHubBoards();

  const liveBoards = boards?.filter((b) => b.status === "live") ?? [];
  const otherBoards = boards?.filter((b) => b.status !== "live") ?? [];
  const singleBoard = !isLoading && liveBoards.length === 1 && otherBoards.length === 0;

  return (
    <section id="boards" className="board-hub-section landing-section">
      <div className="container">
        <div className="section-header fade-in">
          <h2 className="section-title">Available Boards</h2>
          <p className="section-description">
            Click a live board to explore its meetings, votes, and member records.
          </p>
        </div>

        {isLoading ? (
          <div className="board-hub-grid fade-in">
            {[1, 2, 3].map((i) => (
              <div key={i} className="board-hub-skeleton" />
            ))}
          </div>
        ) : (
          <>
            <div className={`board-hub-grid fade-in${singleBoard ? " board-hub-grid-single" : ""}`}>
              {liveBoards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
              {otherBoards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>

            {singleBoard && (
              <p className="board-hub-teaser fade-in">
                More boards coming soon — <Link to="/request">request yours</Link>.
              </p>
            )}
          </>
        )}

        <div className="board-hub-cta fade-in">
          <Link to="/request" className="btn btn-secondary">
            Request your board
          </Link>
        </div>
      </div>
    </section>
  );
}

export const Landing = () => {
  const hubMode = isHubDomain();
  const activeNavItems = hubMode ? hubNavItems : navItems;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="landing-page">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      {/* Sticky Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-nav-logo">
            BoardVotes<span>.io</span>
          </Link>
          <div className="landing-nav-links">
            {activeNavItems.map((item) =>
              "href" in item && item.href ? (
                <a
                  key={item.href}
                  href={item.href}
                  className="landing-nav-item"
                >
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to!}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    ["landing-nav-item", isActive ? "landing-nav-item-active" : ""]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
            {!hubMode && (
              <NavLink to="/votes" className="landing-nav-button landing-nav-cta">
                View Votes
              </NavLink>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <video className="hero-video" autoPlay muted loop playsInline>
          <source src="/landing/videos/hero_civic.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>Transparency Is the First Step Toward Accountability</h1>
          <p className="hero-subtitle">
            Search Baldwin County Board of Education meetings, motions, agendas, and voting records
            — all linked to public source records.
          </p>
          <div className="hero-buttons">
            {hubMode ? (
              <a href="https://bcbe.boardvotes.io" className="btn btn-primary">
                Baldwin County School Board →
              </a>
            ) : (
              <Link to="/meetings" className="btn btn-primary">
                Explore Meetings
              </Link>
            )}
            <a href="#how-it-works" onClick={scrollTo("how-it-works")} className="btn btn-secondary">
              Learn How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Board Selector Section */}
      <BoardSelectorSection />

      {/* Mission Section */}
      <section className="mission landing-section">
        <div className="container">
          <div className="mission-grid">
            <div className="mission-text fade-in">
              <h2>Making School Board Decisions Accessible to All Citizens</h2>
              <p>
                BoardVotes.io is an independent public-records platform. It currently tracks Baldwin County Board of Education (BCBE) meetings and votes and is being built to support additional public boards and governing bodies. Every decision that affects your community should be searchable, source-linked, and understandable without digging through portals, PDFs, and attachments.
              </p>
            </div>
            <div className="mission-stats fade-in">
              <div className="stat-card">
                <span className="stat-number">100%</span>
                <span className="stat-label">Source-Traceable Data</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">Public</span>
                <span className="stat-label">Free Access for All</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">Complete</span>
                <span className="stat-label">Meeting Records</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">Independent</span>
                <span className="stat-label">Non-Partisan Platform</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-section">
        <div className="container">
          <div className="section-header fade-in">
            <h2 className="section-title">Transparency You Can Trust</h2>
            <p className="section-description">
              Every piece of data on BoardVotes.io is traceable directly back to official Baldwin
              County Board of Education public records.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card fade-in">
              <img
                src="/landing/imgs/icon_source.png"
                alt="Source-Traceable Data"
                className="feature-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Source-Traceable Data</h3>
              <p>
                Every vote and decision links directly to official Board of Education records.
                Verify the source yourself.
              </p>
            </div>
            <div className="feature-card fade-in">
              <img
                src="/landing/imgs/icon_summary.png"
                alt="Meeting Summaries"
                className="feature-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Clear Meeting Summaries</h3>
              <p>
                Understand what happened at each meeting without reading lengthy documents. We break
                it down for you.
              </p>
            </div>
            <div className="feature-card fade-in">
              <img
                src="/landing/imgs/icon_voting.png"
                alt="Voting Records"
                className="feature-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Individual Voting Records</h3>
              <p>
                See how each board member voted on every issue. Track positions and accountability.
              </p>
            </div>
            <div className="feature-card fade-in">
              <img
                src="/landing/imgs/icon_trends.png"
                alt="Historical Trends"
                className="feature-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Historical Trends</h3>
              <p>
                Analyze voting patterns and decision trends over time. Understand the bigger picture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works landing-section">
        <div className="container">
          <div className="section-header fade-in">
            <h2 className="section-title">How It Works</h2>
            <p className="section-description">
              Access, review, and stay informed in three simple steps.
            </p>
          </div>
          <div className="steps">
            <div className="step fade-in">
              <div className="step-number">1</div>
              <h3>Browse Meetings</h3>
              <p>
                Access a complete calendar of Board of Education meetings, agendas, and materials.
                Everything in one place.
              </p>
            </div>
            <div className="step fade-in">
              <div className="step-number">2</div>
              <h3>Review Votes</h3>
              <p>
                See individual votes with direct links to source documents. Verify every decision
                for yourself.
              </p>
            </div>
            <div className="step fade-in">
              <div className="step-number">3</div>
              <h3>Stay Informed</h3>
              <p>
                Track issues that matter to you and your community. Knowledge is power in civic
                engagement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources Section */}
      <section id="data-sources" className="data-sources landing-section">
        <div className="container">
          <div className="section-header fade-in">
            <h2 className="section-title">Our Commitment to Accuracy</h2>
          </div>
          <div className="source-content fade-in">
            <h3>Where Our Data Comes From</h3>
            <p>
              All meeting records, agendas, and voting data on BoardVotes.io are sourced directly
              from Baldwin County Board of Education public records. BoardVotes.io is an independent
              project and is not affiliated with or endorsed by Baldwin County Board of Education or
              any government body. Records are presented as extracted from public sources — not
              interpreted or editorialized.
            </p>
            <p>
              Every vote record includes a direct link to the original source document, allowing you
              to verify the information yourself. Transparency about transparency is our promise to
              you.
            </p>
            <span className="source-badge">✓ Independently Verified</span>
          </div>
        </div>
      </section>

      {/* Community Benefits Section */}
      <section id="community" className="community landing-section">
        <div className="container">
          <div className="section-header fade-in">
            <h2 className="section-title">Who Benefits From Transparency</h2>
            <p className="section-description">
              BoardVotes.io serves everyone with a stake in Baldwin County schools.
              BoardVotes.io is independent and is not affiliated with Baldwin County Board of Education or any government body.
            </p>
          </div>
          <div className="community-grid">
            <div className="community-card fade-in">
              <img
                src="/landing/imgs/community_parents.png"
                alt="Parents and Families"
                className="community-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Parents & Families</h3>
              <p>Stay informed about decisions affecting your children's education and school policies.</p>
            </div>
            <div className="community-card fade-in">
              <img
                src="/landing/imgs/community_journalists.png"
                alt="Journalists and Media"
                className="community-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Journalists & Researchers</h3>
              <p>
                Access comprehensive voting records and meeting data for accurate, informed
                reporting.
              </p>
            </div>
            <div className="community-card fade-in">
              <img
                src="/landing/imgs/community_activists.png"
                alt="Community Activists"
                className="community-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Civic Activists</h3>
              <p>
                Track board member accountability and engage effectively on issues that matter to
                your community.
              </p>
            </div>
            <div className="community-card fade-in">
              <img
                src="/landing/imgs/community_educators.png"
                alt="Educators"
                className="community-icon"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <h3>Educators & Staff</h3>
              <p>
                Understand policy decisions that affect teaching, resources, and school operations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Expand Section */}
      <section id="expand" className="landing-section">
        <div className="container">
          <div className="section-header fade-in">
            <h2 className="section-title">Expanding to Boards Everywhere</h2>
            <p className="section-description">
              BoardVotes works for any board or governing body — school boards, HOAs, city councils, water districts, and more. Request yours or list your board to get early access.
            </p>
          </div>
          <div className="expand-grid">
            <div className="expand-card fade-in">
              <h3>I'm a resident or member</h3>
              <p>Want transparency tools for your local board or governing body? Request it and we'll notify you when it goes live.</p>
              <Link to="/request" className="btn btn-primary">Request your board</Link>
            </div>
            <div className="expand-card fade-in">
              <h3>I run a board</h3>
              <p>Bring transparency and public engagement to your organization. List your board to get early access and work with our team directly.</p>
              <Link to="/request" className="btn btn-secondary">Get early access</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <h2>Your Schools. Your Voice. Your Right to Know.</h2>
          <p>Public records belong to everyone. BoardVotes.io makes them searchable, source-linked, and understandable.</p>
          <Link to="/meetings" className="btn btn-primary">
            Browse Meetings Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>BoardVotes.io</h4>
            <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.875rem" }}>
              Independent transparency platform for Baldwin County Board of Education
              — an independent public-records project, not affiliated with BCBE or any government body. BoardVotes.io currently tracks Baldwin County Board of Education and is expanding to additional public boards.
            </p>
          </div>
          <div className="footer-section">
            <h4>Platform</h4>
            <ul>
              <li>
                <Link to="/meetings">Browse Meetings</Link>
              </li>
              <li>
                <Link to="/votes">Voting Records</Link>
              </li>
              <li>
                <Link to="/members">Board Members</Link>
              </li>
              <li>
                <Link to="/boards">Fund a Board</Link>
              </li>
              <li>
                <Link to="/support">Support</Link>
              </li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Explore</h4>
            <ul>
              <li>
                <a href="#how-it-works" onClick={scrollTo("how-it-works")}>
                  How It Works
                </a>
              </li>
              <li>
                <a href="#data-sources" onClick={scrollTo("data-sources")}>
                  Data Sources
                </a>
              </li>
              <li>
                <a href="#community" onClick={scrollTo("community")}>
                  Community Impact
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>About</h4>
            <ul>
              <li>
                <Link to="/dashboard">Dashboard</Link>
              </li>
              <li>
                <Link to="/alliances">Voting Alliances</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            &copy; 2026 BoardVotes.io. An independent civic transparency initiative. Not affiliated
            with Baldwin County Board of Education.
          </p>
        </div>
      </footer>
    </div>
  );
};
