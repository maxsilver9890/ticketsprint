import Link from "next/link";
export function SiteNav() {
  return (
    <header className="site-nav-wrap">
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="wordmark" href="/" aria-label="TicketSprint home">
          <span className="wordmark-icon">
            <span />
          </span>
          <span>
            TicketSprint<small>LIVE DROP PRACTICE</small>
          </span>
        </Link>
        <div className="nav-links">
          <Link href="/arena">Practice drops</Link>
          <Link className="nav-join" href="/arena">
            Choose a drop <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
