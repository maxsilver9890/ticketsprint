"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  QueueRushDifficulty,
  QueueRushDrop,
} from "@ticketsprint/contracts/queue-rush";
import { queueApi } from "./queue-api";
import { formatDuration } from "./format-duration";
import { useSessionBest } from "./SessionBest";

export function EventDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [drop, setDrop] = useState<QueueRushDrop>();
  const [difficulty, setDifficulty] = useState<QueueRushDifficulty>("MEDIUM");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { best } = useSessionBest();
  useEffect(() => {
    let live = true;
    void queueApi<{ drop: QueueRushDrop }>(`/drops/${slug}`)
      .then((v) => {
        if (live) setDrop(v.drop);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Drop unavailable");
      });
    return () => {
      live = false;
    };
  }, [slug]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const v = await queueApi<{ game: { id: string } }>("/games", {
        method: "POST",
        body: { dropSlug: slug, difficulty },
      });
      router.push(`/practice/booking/${v.game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start practice");
    } finally {
      setBusy(false);
    }
  }
  if (!drop)
    return (
      <main className="page-shell">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Loading drop…</p>
        )}
        <Link href="/arena">Back to drops</Link>
      </main>
    );
  return (
    <main className="page-shell event-detail-page">
      <div className="breadcrumb">
        <Link href="/arena">Practice drops</Link>
        <span>/</span>
        <span>{drop.artist}</span>
      </div>
      <section className="event-detail-hero">
        <div className={`queue-drop-art theme-${drop.theme}`}>
          <span>TICKETSPRINT / LIVE PRACTICE</span>
          <strong>{drop.artist}</strong>
          <small>
            {drop.venue} · {drop.location}
          </small>
        </div>
        <div className="event-detail-copy">
          <div className="event-card-kicker">
            <span className="open-pill">PRACTICE AVAILABLE</span>
            <span>216 VIRTUAL SEATS</span>
          </div>
          <p className="event-artist">{drop.artist}</p>
          <h1>{drop.title}</h1>
          <p className="event-detail-description">{drop.description}</p>
          <dl className="event-meta-grid">
            <div>
              <dt>When</dt>
              <dd>
                {drop.date}
                <small>{drop.doors}</small>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {drop.venue}
                <small>{drop.location}</small>
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>
                {drop.format}
                <small>Fictional event</small>
              </dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>
                {(drop.priceCents / 100).toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                })}
                <small>Mock checkout only</small>
              </dd>
            </div>
          </dl>
          <fieldset className="difficulty-picker">
            <legend>Choose difficulty</legend>
            {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
              <label key={d}>
                <input
                  type="radio"
                  name="difficulty"
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                />
                <strong>{d}</strong>
                <small>
                  {d === "EASY"
                    ? "More time · lighter competition"
                    : d === "MEDIUM"
                      ? "Balanced queue and seat rush"
                      : "Fast queue · heavy competition"}
                </small>
              </label>
            ))}
          </fieldset>
          {best[slug] !== undefined && (
            <p className="event-payment-note" role="status">
              Your best this page session:{" "}
              <strong>{formatDuration(best[slug]!)}</strong>
            </p>
          )}
          {error && (
            <p role="alert" className="notice notice-error">
              {error}
            </p>
          )}
          <button
            className="button button-primary"
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? "Starting queue…" : "Join the queue →"}
          </button>
          <p className="event-payment-note">
            No account required. No payment is processed or real tickets issued.
          </p>
        </div>
      </section>
    </main>
  );
}
