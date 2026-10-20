import { describe, expect, it } from "vitest";
import request from "supertest";
import { createQueueRushApp } from "../queue-rush-app.js";
import { QueueRushService } from "./queue-rush.service.js";
import { queueRushRules } from "@ticketsprint/simulation-engine";
describe("Queue Rush HTTP flow", () => {
  it("creates fresh games per retry and supports mock payment idempotently", async () => {
    let now = 1000;
    let serial = 0;
    const service = new QueueRushService({
      now: () => now,
      seed: () => `seed-${++serial}`,
    });
    const app = createQueueRushApp(service);
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    const id = created.body.game.id as string;
    now += 3200;
    let state = await request(app).get(`/api/v1/games/${id}`).expect(200);
    expect(state.body.game.stage).toBe("SEAT_SELECTION");
    const seat = (
      state.body.game.seats as Array<{ id: string; state: string }>
    ).find((s) => s.state === "AVAILABLE")!.id;
    await request(app)
      .post(`/api/v1/games/${id}/hold`)
      .send({ seatIds: [seat] })
      .expect(200);
    await request(app).post(`/api/v1/games/${id}/pay`).send({}).expect(201);
    await request(app).post(`/api/v1/games/${id}/pay`).send({}).expect(200);
    state = await request(app).get(`/api/v1/games/${id}`).expect(200);
    expect(state.body.game.stage).toBe("WON");
    const retry = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    expect(retry.body.game.id).not.toBe(id);
    expect(retry.body.game.stage).toBe("QUEUING");
    expect(retry.body.game.botClaims).toBe(0);
  });
  it("creates a target-seat challenge while preserving open mode as the default", async () => {
    const app = createQueueRushApp(
      new QueueRushService({ now: () => 1000, seed: () => "target-mode" }),
    );
    const open = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    expect(open.body.game.mode).toBe("OPEN");

    const target = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY", mode: "TARGET" })
      .expect(201);
    expect(target.body.game.mode).toBe("TARGET");
    expect(target.body.game.targetSeatIds).toHaveLength(2);
  });
  it("returns seats on hold expiry and rejects stale payment", async () => {
    let now = 1000;
    const app = createQueueRushApp(
      new QueueRushService({ now: () => now, seed: () => "expire-seed" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    const id = created.body.game.id as string;
    now += 3200;
    const ready = await request(app).get(`/api/v1/games/${id}`);
    const seat = (
      ready.body.game.seats as Array<{ id: string; state: string }>
    ).find((s) => s.state === "AVAILABLE")!.id;
    const held = await request(app)
      .post(`/api/v1/games/${id}/hold`)
      .send({ seatIds: [seat] });
    now += 20_000;
    await request(app).post(`/api/v1/games/${id}/pay`).send({}).expect(409);
    const expired = await request(app).get(`/api/v1/games/${id}`);
    expect(
      expired.body.game.seats.find((s: { id: string }) => s.id === seat).state,
    ).not.toBe("HELD");
    expect(held.body.game.stage).toBe("CHECKOUT");
  });
  it("reports queue progress and rejects malformed selections", async () => {
    const app = createQueueRushApp(
      new QueueRushService({ now: () => 1000, seed: () => "queue" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "HARD" })
      .expect(201);
    expect(created.body.game.queue.position).toBe(10);
    await request(app)
      .post(`/api/v1/games/${created.body.game.id}/hold`)
      .send({ seatIds: ["FL-A01"] })
      .expect(409);
  });
  it("runs bot inventory events during the queue and admits hard difficulty to seats", async () => {
    let now = 1000;
    const app = createQueueRushApp(
      new QueueRushService({ now: () => now, seed: () => "repeatable" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "HARD" })
      .expect(201);
    now += 2_000;
    const waiting = await request(app)
      .get(`/api/v1/games/${created.body.game.id}`)
      .expect(200);
    expect(waiting.body.game.stage).toBe("QUEUING");
    expect(waiting.body.game.queue.elapsedMs).toBe(2_000);
    expect(waiting.body.game.botClaims).toBeGreaterThan(0);
    now = 1000 + 9 * 600;
    const admitted = await request(app)
      .get(`/api/v1/games/${created.body.game.id}`)
      .expect(200);
    expect(admitted.body.game.stage).toBe("SEAT_SELECTION");
    expect(admitted.body.game.timing.queueMs).toBe(9 * 600);
    expect(admitted.body.game.queue.inventoryRemaining).toBeGreaterThan(0);
  });
  it.each(["EASY", "MEDIUM", "HARD"] as const)(
    "%s API polls advance every due deterministic bot claim",
    async (difficulty) => {
      let now = 1000;
      const rules = queueRushRules[difficulty];
      const app = createQueueRushApp(
        new QueueRushService({ now: () => now, seed: () => `poll-${difficulty}` }),
      );
      const created = await request(app)
        .post("/api/v1/games")
        .send({ dropSlug: "stadium-opening", difficulty })
        .expect(201);
      const id = created.body.game.id as string;
      now = 1000 + rules.botsAhead * rules.queueStepMs + 10_000;
      const earlier = await request(app).get(`/api/v1/games/${id}`).expect(200);
      now += 10_000;
      const later = await request(app).get(`/api/v1/games/${id}`).expect(200);
      expect(earlier.body.game.stage).toBe("SEAT_SELECTION");
      expect(later.body.game.stage).toBe("SEAT_SELECTION");
      expect(later.body.game.botClaims).toBeGreaterThan(
        earlier.body.game.botClaims,
      );
      expect(later.body.game.queue.inventoryRemaining).toBeLessThan(
        earlier.body.game.queue.inventoryRemaining,
      );
    },
  );
  it("atomically gives a contested seat to only one hold request", async () => {
    let now = 1000;
    const app = createQueueRushApp(
      new QueueRushService({ now: () => now, seed: () => "contended" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    const id = created.body.game.id as string;
    now += 3200;
    const ready = await request(app).get(`/api/v1/games/${id}`).expect(200);
    const seat = ready.body.game.seats.find(
      (candidate: { state: string }) => candidate.state === "AVAILABLE",
    ).id as string;
    const results = await Promise.all([
      request(app).post(`/api/v1/games/${id}/hold`).send({ seatIds: [seat] }),
      request(app).post(`/api/v1/games/${id}/hold`).send({ seatIds: [seat] }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  });
  it("secures seats one-by-one, preserves them while adding seats, then checks out", async () => {
    let now = 1000;
    const app = createQueueRushApp(
      new QueueRushService({ now: () => now, seed: () => "sequential-selection" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    const id = created.body.game.id as string;
    now += 3200;
    const ready = await request(app).get(`/api/v1/games/${id}`).expect(200);
    const available = ready.body.game.seats
      .filter((seat: { state: string }) => seat.state === "AVAILABLE")
      .slice(0, 4)
      .map((seat: { id: string }) => seat.id as string);

    const first = await request(app)
      .post(`/api/v1/games/${id}/selection`)
      .send({ seatIds: [available[0]] })
      .expect(200);
    const expiresAt = first.body.game.timing.holdExpiresAtMs;
    const second = await request(app)
      .post(`/api/v1/games/${id}/selection`)
      .send({ seatIds: [available[0], available[1]] })
      .expect(200);
    expect(second.body.game.stage).toBe("SEAT_SELECTION");
    expect(second.body.game.selectedSeatIds).toEqual([available[0], available[1]]);
    expect(second.body.game.timing.holdExpiresAtMs).toBe(expiresAt);
    for (const seatId of [available[0], available[1]]) {
      expect(
        second.body.game.seats.find((seat: { id: string }) => seat.id === seatId)
          .state,
      ).toBe("HELD");
    }

    now += 1_500;
    const polled = await request(app).get(`/api/v1/games/${id}`).expect(200);
    expect(polled.body.game.selectedSeatIds).toEqual([available[0], available[1]]);
    expect(
      polled.body.game.seats.find(
        (seat: { id: string }) => seat.id === available[0],
      ).state,
    ).toBe("HELD");

    const additionalSeats = polled.body.game.seats
      .filter((seat: { state: string }) => seat.state === "AVAILABLE")
      .slice(0, 2)
      .map((seat: { id: string }) => seat.id as string);
    const completeSelection = [available[0], available[1], ...additionalSeats];
    const four = await request(app)
      .post(`/api/v1/games/${id}/selection`)
      .send({ seatIds: completeSelection })
      .expect(200);
    expect(four.body.game.selectedSeatIds).toEqual(completeSelection);
    const checkout = await request(app)
      .post(`/api/v1/games/${id}/hold`)
      .send({ seatIds: completeSelection })
      .expect(200);
    expect(checkout.body.game.stage).toBe("CHECKOUT");
    expect(checkout.body.game.timing.holdExpiresAtMs).toBe(expiresAt);
    await request(app).post(`/api/v1/games/${id}/pay`).send({}).expect(201);
  });
  it("rejects an unavailable seat without dropping the player's existing hold", async () => {
    let now = 1000;
    const app = createQueueRushApp(
      new QueueRushService({ now: () => now, seed: () => "contention" }),
    );
    const created = await request(app)
      .post("/api/v1/games")
      .send({ dropSlug: "stadium-opening", difficulty: "EASY" })
      .expect(201);
    const id = created.body.game.id as string;
    now += 3200;
    const ready = await request(app).get(`/api/v1/games/${id}`).expect(200);
    const available = ready.body.game.seats.find(
      (seat: { state: string }) => seat.state === "AVAILABLE",
    ).id as string;
    const sold = ready.body.game.seats.find(
      (seat: { state: string }) => seat.state === "SOLD",
    ).id as string;
    await request(app)
      .post(`/api/v1/games/${id}/selection`)
      .send({ seatIds: [available] })
      .expect(200);
    const contested = await request(app)
      .post(`/api/v1/games/${id}/selection`)
      .send({ seatIds: [available, sold] })
      .expect(409);
    expect(contested.body.error.message).toMatch(/active seat holds remain secured/i);
    const state = await request(app).get(`/api/v1/games/${id}`).expect(200);
    expect(state.body.game.selectedSeatIds).toEqual([available]);
    expect(
      state.body.game.seats.find(
        (seat: { id: string }) => seat.id === available,
      ).state,
    ).toBe("HELD");
  });
});
describe("Queue Rush CORS", () => {
  it("allows only the configured frontend origin", async () => {
    const originalOrigin = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "https://ticketsprint-omega.vercel.app";
    try {
      const app = createQueueRushApp(new QueueRushService({ seed: () => "cors" }));
      const allowed = await request(app)
        .get("/api/v1/health/live")
        .set("Origin", "https://ticketsprint-omega.vercel.app")
        .expect(200);
      expect(allowed.headers["access-control-allow-origin"]).toBe(
        "https://ticketsprint-omega.vercel.app",
      );

      const denied = await request(app)
        .get("/api/v1/health/live")
        .set("Origin", "https://example.invalid")
        .expect(200);
      expect(denied.headers["access-control-allow-origin"]).toBe(
        "https://ticketsprint-omega.vercel.app",
      );
    } finally {
      if (originalOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = originalOrigin;
    }
  });
});
