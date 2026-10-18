"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { QueueRushDrop } from "@ticketsprint/contracts/queue-rush";
import { queueApi } from "./queue-api";

export function ArenaClient() {
  const [drops, setDrops] = useState<QueueRushDrop[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void queueApi<{ drops: QueueRushDrop[] }>("/drops")
      .then((data) => {
        if (live) setDrops(data.drops);
      })
      .catch((e: unknown) => {
        if (live)
          setError(e instanceof Error ? e.message : "Drops unavailable");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main className="page-shell arena-page">
      <header className="page-header arena-heading">
        <div>
          <p className="eyebrow">
            <span className="live-dot" />
            THE PRACTICE ARENA
          </p>
          <h1>
            Choose your
            <br />
            <em>next drop.</em>
          </h1>
          <p className="lede">
            Queue against virtual buyers, claim seats, and check out before the
            rush ends.
          </p>
        </div>
        <div className="arena-header-note">
          <span>SIMULATED LIVE</span>
          <strong>{drops.length.toString().padStart(2, "0")}</strong>
          <small>practice drops</small>
        </div>
      </header>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="scenario-grid">
        {drops.map((drop) => (
          <Link
            className="event-card-link"
            href={`/events/${drop.slug}`}
            aria-label={drop.title}
            key={drop.slug}
          >
            <article className="event-card">
              <div className={`queue-drop-art theme-${drop.theme}`}>
                <span>TICKETSPRINT / PRACTICE DROP</span>
                <strong>{drop.artist}</strong>
                <small>
                  {drop.venue} · {drop.location}
                </small>
              </div>
              <div className="event-card-body">
                <p className="event-artist">
                  {drop.date} · {drop.doors}
                </p>
                <h2>{drop.title}</h2>
                <p>{drop.description}</p>
                <div className="event-card-foot">
                  <span>216 virtual seats · bots compete live</span>
                  <span className="text-link" aria-hidden="true">
                    View drop ↗
                  </span>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>
      <p className="arena-footnote">
        Fictional events only. No accounts, real tickets, or payment processing.
      </p>
    </main>
  );
}
