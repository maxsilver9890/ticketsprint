"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { QueueRushGameView } from "@ticketsprint/contracts/queue-rush";
import { queueApi } from "./queue-api";
import { formatDuration } from "./api";
import { useSessionBest } from "./SessionBest";
export function ResultsClient({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [game, setGame] = useState<QueueRushGameView>();
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const { best, record } = useSessionBest();
  useEffect(() => {
    let live = true;
    void queueApi<{ game: QueueRushGameView }>(`/games/${attemptId}`)
      .then(({ game: g }) => {
        if (live) {
          setGame(g);
          if (g.stage === "WON" && g.timing.completionMs !== null)
            record(g.drop.slug, g.timing.completionMs);
        }
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "Result unavailable");
      });
    return () => {
      live = false;
    };
  }, [attemptId, record]);
  async function retry() {
    if (!game) return;
    setRetrying(true);
    try {
      const v = await queueApi<{ game: { id: string } }>("/games", {
        method: "POST",
        body: { dropSlug: game.drop.slug, difficulty: game.difficulty },
      });
      router.push(`/practice/booking/${v.game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry");
    } finally {
      setRetrying(false);
    }
  }
  if (error)
    return (
      <main className="page-shell">
        <p className="notice notice-error" role="alert">
          {error}
        </p>
        <Link href="/arena">Choose another drop</Link>
      </main>
    );
  if (!game)
    return (
      <main className="page-shell">
        <p role="status">Loading result…</p>
      </main>
    );
  const won = game.stage === "WON",
    pb = best[game.drop.slug];
  return (
    <main
      className={`page-shell result-shell ${won ? "result-confirmed" : "result-failed"}`}
    >
      <header className="page-header result-header">
        <div>
          <p className="eyebrow">PRACTICE RESULT · {game.drop.title}</p>
          <h1>{won ? "You got the seats." : "The rush got away."}</h1>
          <p className="lede">
            {won
              ? "The server confirmed your mock checkout."
              : game.failureReason === "INVENTORY_EXHAUSTED"
                ? "Virtual inventory was exhausted by the competing buyers."
                : "The server deadline expired before checkout completed."}
          </p>
        </div>
        <span className={`result-stamp ${won ? "result-won" : "result-lost"}`}>
          {won ? "WON" : "LOST"}
        </span>
      </header>
      <section className="result-grid" aria-label="Run timings">
        <article className="result-metric">
          <span>Total time</span>
          <strong>
            {game.timing.completionMs === null
              ? "—"
              : formatDuration(game.timing.completionMs)}
          </strong>
        </article>
        <article className="result-metric">
          <span>Queue</span>
          <strong>
            {game.timing.queueMs === null
              ? "—"
              : formatDuration(game.timing.queueMs)}
          </strong>
        </article>
        <article className="result-metric">
          <span>Seat selection</span>
          <strong>
            {game.timing.selectionMs === null
              ? "—"
              : formatDuration(game.timing.selectionMs)}
          </strong>
        </article>
        <article className="result-metric">
          <span>Checkout</span>
          <strong>
            {game.timing.checkoutMs === null
              ? "—"
              : formatDuration(game.timing.checkoutMs)}
          </strong>
        </article>
      </section>
      {won && (
        <aside className="event-simulation-note" role="status">
          <p>
            <strong>Mock payment approved.</strong> Seats{" "}
            {game.selectedSeatIds.join(", ")} · Visa ···· 4242 (fictional)
          </p>
        </aside>
      )}
      {won && pb !== undefined && (
        <aside className="event-simulation-note" role="status">
          <p>
            <strong>
              {pb === game.timing.completionMs
                ? "Session best!"
                : "Your session best"}
            </strong>{" "}
            {formatDuration(pb)} · stored in this page session only.
          </p>
        </aside>
      )}
      <nav className="result-actions">
        <button
          className="button button-primary"
          disabled={retrying}
          onClick={() => void retry()}
        >
          {retrying ? "Starting…" : "Retry this drop"}
        </button>
        <Link className="button button-secondary" href="/arena">
          Choose another drop
        </Link>
      </nav>
    </main>
  );
}
