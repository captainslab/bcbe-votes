import { useEffect } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

export const Landing = () => {
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
            <a href="#features" onClick={scrollTo("features")} className="landing-nav-hide-mobile">
              Features
            </a>
            <a href="#how-it-works" onClick={scrollTo("how-it-works")} className="landing-nav-hide-mobile">
              How It Works
            </a>
            <Link to="/dashboard" className="landing-nav-hide-mobile">
              Dashboard
            </Link>
            <Link to="/request">Add a Board</Link>
            <Link to="/donate">Support</Link>
            <Link to="/votes" className="landing-nav-cta">
              View Votes
            </Link>
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
            — all linked to official public sources.
          </p>
          <div className="hero-buttons">
            <Link to="/meetings" className="btn btn-primary">
              Explore Meetings
            </Link>
            <a href="#how-it-works" onClick={scrollTo("how-it-works")} className="btn btn-secondary">
              Learn How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="mission landing-section">
        <div className="container">
          <div className="mission-grid">
            <div className="mission-text fade-in">
              <h2>Making School Board Decisions Accessible to All Citizens</h2>
              <p>
                BoardVotes.io is an independent transparency platform dedicated to providing Baldwin
                County residents with easy access to complete, accurate records of Board of Education
                meetings and votes. Every decision that affects our schools should be open and
                understandable to the community it serves.
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
              County records.
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
              from official Baldwin County Board of Education public records. We don't interpret or
              editorialize—we present the facts as they are recorded.
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
          <p>Baldwin County residents deserve full access to the decisions that shape our schools.</p>
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
                <Link to="/donate">Support</Link>
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
