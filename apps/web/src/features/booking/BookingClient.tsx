"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueRushGameView } from "@ticketsprint/contracts/queue-rush";
import { queueApi } from "./queue-api";
import { formatDuration } from "./format-duration";

export function BookingClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [game, setGame] = useState<QueueRushGameView>();
  const [now, setNow] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const refresh = useCallback(async () => {
    if (busyRef.current || pollingRef.current) return;
    pollingRef.current = true;
    const requestVersion = requestVersionRef.current;
    try {
      const v = await queueApi<{ game: QueueRushGameView }>(
        `/games/${sessionId}`,
      );
      if (busyRef.current || requestVersion !== requestVersionRef.current)
        return;
      const receivedAt = Date.now();
      setGame(v.game);
      setSnapshotAt(receivedAt);
      setNow(receivedAt);
      if (v.game.stage === "WON" || v.game.stage === "LOST")
        router.replace(`/results/${sessionId}`);
    } catch (e) {
      if (!busyRef.current && requestVersion === requestVersionRef.current)
        setError(e instanceof Error ? e.message : "Practice game unavailable");
    } finally {
      pollingRef.current = false;
    }
  }, [sessionId, router]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const p = window.setInterval(() => void refresh(), 250);
    const c = window.setInterval(() => setNow(Date.now()), 100);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(p);
      window.clearInterval(c);
    };
  }, [refresh]);
  const action = useCallback(async (path: string, body: unknown = {}) => {
    busyRef.current = true;
    requestVersionRef.current += 1;
    setBusy(true);
    setError("");
    try {
      const v = await queueApi<{ game: QueueRushGameView }>(path, {
        method: "POST",
        body,
      });
      const receivedAt = Date.now();
      setGame(v.game);
      setSnapshotAt(receivedAt);
      setNow(receivedAt);
      if (v.game.stage === "WON" || v.game.stage === "LOST")
        router.replace(`/results/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
      void refresh();
    }
  }, [refresh, router, sessionId]);
  if (!game)
    return (
      <main className="page-shell">
        <p role="status">Joining the queue…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const serverNowEstimate = now + (game.serverNowMs - snapshotAt);
  const endAt =
    game.stage === "CHECKOUT"
      ? game.timing.holdExpiresAtMs
      : game.stage === "SEAT_SELECTION" &&
          game.timing.holdExpiresAtMs !== null
        ? game.timing.holdExpiresAtMs
      : game.timing.deadlineAtMs;
  const remaining = Math.max(0, endAt === null ? 0 : endAt - serverNowEstimate);
  const timerValue =
    game.stage === "QUEUING" ? game.queue.elapsedMs : remaining;
  if (game.stage === "WON" || game.stage === "LOST") {
    const won = game.stage === "WON";
    return (
      <main className="page-shell result-shell">
        <header className="page-header result-header">
          <div>
            <p className="eyebrow">PRACTICE RESULT · {game.drop.title}</p>
            <h1>{won ? "You got the seats." : "The rush got away."}</h1>
            <p className="lede">
              {won
                ? "The server confirmed your mock checkout. No real payment was processed."
                : game.failureReason === "INVENTORY_EXHAUSTED"
                  ? "Virtual inventory was exhausted by the competing buyers."
                  : game.failureReason === "TARGET_SEATS_CLAIMED"
                    ? "A competing buyer claimed one of your assigned target seats."
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
            <strong>{game.timing.completionMs === null ? "—" : formatDuration(game.timing.completionMs)}</strong>
          </article>
          <article className="result-metric">
            <span>Queue</span>
            <strong>{game.timing.queueMs === null ? "—" : formatDuration(game.timing.queueMs)}</strong>
          </article>
          <article className="result-metric">
            <span>Seat selection</span>
            <strong>{game.timing.selectionMs === null ? "—" : formatDuration(game.timing.selectionMs)}</strong>
          </article>
          <article className="result-metric">
            <span>Checkout</span>
            <strong>{game.timing.checkoutMs === null ? "—" : formatDuration(game.timing.checkoutMs)}</strong>
          </article>
        </section>
        {won && (
          <aside className="event-simulation-note" role="status">
            <p><strong>Mock payment approved.</strong> Virtual seats {game.selectedSeatIds.join(", ")} · no real tickets issued.</p>
          </aside>
        )}
        <Link className="button button-primary" href={`/results/${sessionId}`}>
          View full result
        </Link>
      </main>
    );
  }
  const toggle = (id: string) => {
    if (busy) return;
    const selected = game.selectedSeatIds;
    const next = selected.includes(id)
      ? selected.filter((seatId) => seatId !== id)
      : selected.length < 4
        ? [...selected, id]
        : selected;
    if (next !== selected)
      void action(`/games/${sessionId}/selection`, { seatIds: next });
  };
  const sections = [...new Set(game.seats.map((s) => s.sectionName))];
  return (
    <main className="page-shell booking-shell queue-game">
      <header className="booking-header">
        <div>
          <Link className="quiet-link" href={`/events/${game.drop.slug}`}>
            ← Drop details
          </Link>
          <p className="eyebrow booking-kicker">
            {game.difficulty} QUEUE RUSH · {game.stage.replaceAll("_", " ")}
          </p>
          <h1>{game.drop.title}</h1>
          <p className="booking-event-meta">
            {game.drop.venue} · {game.drop.date}
          </p>
        </div>
        <div
          className={`timer-card ${remaining < 10000 ? "timer-urgent" : ""}`}
          aria-live="polite"
        >
          <span>
            {game.stage === "QUEUING"
              ? "Queue elapsed"
              : game.timing.holdExpiresAtMs !== null
                ? "Seat hold"
                : "Time remaining"}
          </span>
          <strong>{formatDuration(timerValue)}</strong>
          <small>SERVER AUTHORITATIVE</small>
        </div>
      </header>
      <ol className="stage-rail" aria-label="Practice stages">
        {["Queue", "Seats", "Checkout", "Result"].map((s, i) => (
          <li
            key={s}
            className={
              (i === 0 && game.stage === "QUEUING") ||
              (i === 1 && game.stage === "SEAT_SELECTION") ||
              (i === 2 && game.stage === "CHECKOUT")
                ? "stage-current"
                : ""
            }
          >
            {String(i + 1).padStart(2, "0")} {s}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
      {game.notice && (
        <p role="status" className="notice">
          {game.notice}
        </p>
      )}
      {game.stage === "QUEUING" && (
        <section className="booking-panel queue-status">
          <p className="eyebrow">LIVE QUEUE · {game.queue.saleStatus.replaceAll("_", " ")}</p>
          <h2>
            Queue position {game.queue.position} of {game.queue.total}
          </h2>
          <p>Admission starts when the bots ahead enter the seat map.</p>
          <div
            className="waiting-progress"
            role="progressbar"
            aria-label="Queue progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={game.queue.progressPercent}
          >
            <span style={{ width: `${game.queue.progressPercent}%` }} />
          </div>
          <div className="queue-facts">
            <span>{game.queue.position - 1} bots ahead of you</span>
            <span>
              {game.botClaims} sold · {game.queue.inventoryRemaining} seats left
            </span>
          </div>
        </section>
      )}
      {(game.stage === "SEAT_SELECTION" || game.stage === "CHECKOUT") && (
        <section className="booking-panel seat-rush-panel">
          <div className="seat-map-heading">
            <div>
              <p className="eyebrow">
                LIVE VIRTUAL INVENTORY · {game.botClaims} CLAIMED BY BOTS
              </p>
              <h2>
                {game.stage === "CHECKOUT"
                  ? "Your seats are held."
                  : game.selectedSeatIds.length > 0
                    ? `${game.selectedSeatIds.length} seat${game.selectedSeatIds.length === 1 ? "" : "s"} secured.`
                    : "Choose up to four seats."}
              </h2>
              <p className="muted">
                Selecting a seat reserves it on the server immediately. Your
                hold countdown starts with the first seat; bots cannot claim
                held seats. Tap another available seat to add it, or tap your
                held seat again to release it.
              </p>
              {game.mode === "TARGET" && (
                <p className="notice" role="status">
                  Target challenge: book both assigned seats in this row — {game.targetSeatIds.join(" and ")}.
                  Booking any other seat will not complete the challenge.
                </p>
              )}
            </div>
            <div className="seat-legend">
              <span>
                <i />
                Available
              </span>
              <span>
                <i className="legend-bot" />
                Sold
              </span>
              <span>
                <i className="legend-held" />
                Your hold
              </span>
            </div>
          </div>
          <div className="stadium-map">
            <div className="stadium-stage">STAGE</div>
            {sections.map((section) => (
              <section className="seat-section" key={section}>
                <h3>{section}</h3>
                {[
                  ...new Set(
                    game.seats
                      .filter((s) => s.sectionName === section)
                      .map((s) => s.row),
                  ),
                ].map((row) => (
                  <div className="seat-row" key={row}>
                    <span>{row}</span>
                    {game.seats
                      .filter((s) => s.sectionName === section && s.row === row)
                      .map((seat) => {
                        const chosen = game.selectedSeatIds.includes(seat.id);
                        const state = seat.state.toLowerCase();
                        return (
                          <button
                            key={seat.id}
                            title={`${seat.sectionName} ${seat.id} · ${seat.state}`}
                            aria-label={`${seat.id} ${seat.state}`}
                            aria-pressed={chosen}
                            disabled={
                              busy ||
                              game.stage === "CHECKOUT" ||
                              (game.mode === "TARGET" && !game.targetSeatIds.includes(seat.id)) ||
                              (seat.state !== "AVAILABLE" && !chosen)
                            }
                            className={`seat-dot seat-${state}${chosen ? " seat-selected" : ""}`}
                            onClick={() => toggle(seat.id)}
                          >
                            {seat.number}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </section>
            ))}
          </div>
          {game.stage === "SEAT_SELECTION" && (
            <button
              className="button button-primary"
              disabled={
                busy ||
                game.selectedSeatIds.length === 0 ||
                (game.mode === "TARGET" &&
                  game.targetSeatIds.some((id) => !game.selectedSeatIds.includes(id)))
              }
              onClick={() =>
                void action(`/games/${sessionId}/hold`, {
                  seatIds: game.selectedSeatIds,
                })
              }
            >
              {busy
                ? "Opening checkout…"
                : `Continue with ${game.selectedSeatIds.length} seat${game.selectedSeatIds.length === 1 ? "" : "s"} →`}
            </button>
          )}
        </section>
      )}
      {game.stage === "CHECKOUT" && (
        <section className="booking-panel mock-payment">
          <p className="eyebrow">MOCK CHECKOUT · FICTIONAL PAYMENT METHOD</p>
          <h2>Finish your practice run.</h2>
          <div className="review-card">
            <span>{game.drop.title}</span>
            <strong>{game.selectedSeatIds.join(" · ")}</strong>
            <small>
              Visa ···· 4242 <b>Demo only</b>
            </small>
            <span className="review-practice-note">
              No card data or real payment is used.
            </span>
          </div>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void action(`/games/${sessionId}/pay`)}
          >
            {busy ? "Confirming…" : "Pay Now"}
          </button>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void action(`/games/${sessionId}/hold/release`)}
          >
            Abandon checkout and release seats
          </button>
        </section>
      )}
    </main>
  );
}
