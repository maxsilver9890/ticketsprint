import Link from "next/link";
import { HomeHeroActions } from "@/components/HomeHeroActions";

const highlights = [
  {
    number: "01",
    title: "Read the room",
    copy: "See the sale state and know what the simulation is waiting for.",
  },
  {
    number: "02",
    title: "Make your picks",
    copy: "Choose seats while virtual buyers compete for the same inventory.",
  },
  {
    number: "03",
    title: "Check out",
    copy: "Beat the server-side deadline with a fictional mock payment.",
  },
];

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="home-hero page-shell" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" aria-hidden="true" /> THE DROP IS A SKILL
          </p>
          <h1 id="home-title">
            Be ready when
            <br />
            <em>the room opens.</em>
          </h1>
          <p className="lede">
            Practice the pressure of a high-demand ticket drop. Join a live
            queue, choose seats as virtual buyers compete, and beat the
            server-timed checkout.
          </p>
          <HomeHeroActions />
          <p className="hero-disclaimer">
            SIMULATED EVENTS ONLY <span aria-hidden="true">·</span> NO PAYMENT{" "}
            <span aria-hidden="true">·</span> NO REAL TICKETS
          </p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-poster">
            <div className="hero-poster-sun" />
            <span className="hero-poster-top">
              TICKETSPRINT / FIELD NOTES 001
            </span>
            <span className="hero-poster-words">
              MOMENT
              <br />
              BEFORE
              <br />
              <i>GO</i>
            </span>
            <span className="hero-poster-bottom">
              <span>SIMULATE THE RUSH</span>
              <span>01 — 04</span>
            </span>
          </div>
          <div className="hero-ticket">
            <span>ENTRY / PRACTICE</span>
            <strong>
              YOUR NEXT
              <br />
              GOOD RUN
            </strong>
            <small>SERVER-TIMED SESSION</small>
          </div>
          <span className="hero-orbit hero-orbit-a" />
          <span className="hero-orbit hero-orbit-b" />
        </div>
      </section>

      <section className="home-how page-shell" aria-labelledby="how-title">
        <div className="section-intro">
          <p className="eyebrow">BUILT FOR THE MOMENT</p>
          <h2 id="how-title">
            Practice the whole
            <br />
            booking rhythm.
          </h2>
        </div>
        <ol className="how-list">
          {highlights.map((item) => (
            <li key={item.number}>
              <span>{item.number}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-bottom page-shell">
        <p>Virtual inventory. Server-side timing. Fresh runs anytime.</p>
        <Link className="button button-secondary" href="/arena">
          Find your next practice drop <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </main>
  );
}
