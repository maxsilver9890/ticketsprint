import { describe, expect, it } from "vitest";
import request from "supertest";
import { createQueueRushApp } from "../queue-rush-app.js";
import { QueueRushService } from "./queue-rush.service.js";
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
});
