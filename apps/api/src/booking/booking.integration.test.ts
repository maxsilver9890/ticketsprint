import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { createClient } from "redis";
import { getApiEnv } from "@ticketsprint/config/env";
import { createApp } from "../app.js";

const env = getApiEnv();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const redis = createClient({ url: env.REDIS_URL });
const app = createApp(prisma, redis);
const runId = randomUUID().replaceAll("-", "").slice(0, 10);
const userIds: string[] = [];

type Actor = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
async function registerActor(suffix: string): Promise<Actor> {
  const agent = request.agent(app);
  const tokenResponse = await agent.get("/api/v1/auth/csrf");
  const csrf = tokenResponse.body.csrfToken as string;
  const response = await agent.post("/api/v1/auth/register").set("X-CSRF-Token", csrf).send({
    username: `p2_${runId}_${suffix}`,
    email: `phase2-${runId}-${suffix}@example.test`,
    password: "a-secure-phase-two-password",
  });
  expect(response.status).toBe(201);
  const id = response.body.user.id as string;
  userIds.push(id);
  return { agent, csrf, id };
}

async function versionId(slug: string) {
  const version = await prisma.scenarioVersion.findFirst({ where: { scenario: { slug } }, select: { id: true } });
  if (!version) throw new Error(`Missing seeded scenario ${slug}; run pnpm db:seed first.`);
  return version.id;
}

async function createSession(actor: Actor, slug: string) {
  const response = await actor.agent.post("/api/v1/sessions").set("X-CSRF-Token", actor.csrf).send({ scenarioVersionId: await versionId(slug) });
  expect(response.status).toBe(201);
  return response.body.session as { id: string; stage: string };
}

async function action(actor: Actor, sessionId: string, data: Record<string, unknown>) {
  return actor.agent.post(`/api/v1/sessions/${sessionId}/events`).set("X-CSRF-Token", actor.csrf).send({ ...data, clientEventId: randomUUID() });
}

async function completeStandard(actor: Actor, sessionId: string) {
  const category = await action(actor, sessionId, { type: "SELECT_CATEGORY", categoryId: "floor" });
  expect(category.status).toBe(200);
  const quantity = await action(actor, sessionId, { type: "SELECT_QUANTITY", quantity: 2 });
  expect(quantity.status).toBe(200);
  const seats = await action(actor, sessionId, { type: "SELECT_SEATS", seatIds: ["F-01", "F-02"] });
  expect(seats.status).toBe(200);
  const verify = await action(actor, sessionId, { type: "COMPLETE_VERIFICATION" });
  expect(verify.status).toBe(200);
  expect(verify.body.session.stage).toBe("REVIEW");
}

let primary: Actor;
let other: Actor;
beforeAll(async () => {
  await prisma.$connect();
  primary = await registerActor("main");
  other = await registerActor("other");
});
afterAll(async () => {
  const sessions = await prisma.practiceSession.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);
  const attempts = await prisma.attempt.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const attemptIds = attempts.map((attempt) => attempt.id);
  if (userIds.length) await prisma.personalBest.deleteMany({ where: { userId: { in: userIds } } });
  if (attemptIds.length) await prisma.attemptEvent.deleteMany({ where: { attemptId: { in: attemptIds } } });
  if (sessionIds.length) await prisma.sessionEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
  if (attemptIds.length) await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
  if (sessionIds.length) await prisma.practiceSession.deleteMany({ where: { id: { in: sessionIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("booking API with PostgreSQL", () => {
  it("lists public scenarios without disclosing virtual buyer configuration", async () => {
    const response = await request(app).get("/api/v1/scenarios");
    expect(response.status).toBe(200);
    expect(response.body.scenarios.map((scenario: { slug: string }) => scenario.slug)).toContain("stadium-opening");
    expect(JSON.stringify(response.body)).not.toContain("virtualBuyerProfiles");
  });

  it("creates an authenticated session and rejects access by another user", async () => {
    const created = await createSession(primary, "stadium-opening");
    const owner = await primary.agent.get(`/api/v1/sessions/${created.id}`);
    expect(owner.status).toBe(200);
    expect(owner.body.session.seed).toBeUndefined();
    const denied = await other.agent.get(`/api/v1/sessions/${created.id}`);
    expect(denied.status).toBe(403);
  });

  it("persists a standard success and makes concurrent submit retries idempotent", async () => {
    const created = await createSession(primary, "stadium-opening");
    await completeStandard(primary, created.id);
    const submit = () => primary.agent.post(`/api/v1/sessions/${created.id}/submit`).set("X-CSRF-Token", primary.csrf).send({});
    const [first, second] = await Promise.all([submit(), submit()]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.attempt.id).toBe(second.body.attempt.id);
    expect(first.body.attempt).toMatchObject({ outcome: "CONFIRMED", failureReason: null, requestedQuantity: 2, allocatedQuantity: 2 });
    expect(await prisma.attempt.count({ where: { sessionId: created.id } })).toBe(1);
    const retry = await submit();
    expect(retry.status).toBe(200);
    expect(retry.body.attempt.outcome).toBe("CONFIRMED");
    const persisted = await primary.agent.get(`/api/v1/attempts/${first.body.attempt.id}`);
    expect(persisted.body.attempt).toMatchObject({
      scenario: { slug: "stadium-opening" },
      selection: { categoryId: "floor", categoryLabel: "Floor", seatIds: ["F-01", "F-02"], quantity: 2, unitPriceCents: 8500 },
    });
  });

  it("persists the fastest confirmed personal best per user and scenario version", async () => {
    const runner = await registerActor("pb");
    async function completeAt(elapsedMs: number) {
      const session = await createSession(runner, "stadium-opening");
      await completeStandard(runner, session.id);
      await prisma.practiceSession.update({ where: { id: session.id }, data: { saleOpenedAt: new Date(Date.now() - elapsedMs) } });
      const response = await runner.agent.post(`/api/v1/sessions/${session.id}/submit`).set("X-CSRF-Token", runner.csrf).send({});
      expect(response.status).toBe(201);
      return response.body.attempt as { id: string; completionMs: number };
    }

    const first = await completeAt(8_000);
    const firstBest = await runner.agent.get("/api/v1/scenarios/stadium-opening/personal-best");
    expect(firstBest.body.personalBest).toMatchObject({ attemptId: first.id });
    expect(firstBest.body.personalBest.completionMs).toBeGreaterThanOrEqual(8_000);

    const faster = await completeAt(4_000);
    const fasterResult = await runner.agent.get(`/api/v1/attempts/${faster.id}`);
    expect(fasterResult.body.attempt.isPersonalBest).toBe(true);
    expect(fasterResult.body.attempt.personalBest.attemptId).toBe(faster.id);
    expect(fasterResult.body.attempt.personalBest.completionMs).toBe(faster.completionMs);

    const slower = await completeAt(10_000);
    const slowerResult = await runner.agent.get(`/api/v1/attempts/${slower.id}`);
    expect(slowerResult.body.attempt.isPersonalBest).toBe(false);
    expect(slowerResult.body.attempt.personalBest.attemptId).toBe(faster.id);

    const otherBest = await other.agent.get("/api/v1/scenarios/stadium-opening/personal-best");
    expect(otherBest.status).toBe(200);
    expect(otherBest.body.personalBest).toBeNull();
  });

  it("persists deadline-based SOLD_OUT and session expiry as distinct outcomes", async () => {
    const late = await createSession(primary, "stadium-opening");
    await prisma.practiceSession.update({ where: { id: late.id }, data: { saleOpenedAt: new Date(Date.now() - 60_001) } });
    const soldOut = await primary.agent.get(`/api/v1/sessions/${late.id}`);
    expect(soldOut.body.attempt).toMatchObject({ outcome: "SOLD_OUT", failureReason: "DEADLINE_MISSED" });
    expect(await prisma.practiceSession.findUniqueOrThrow({ where: { id: late.id } })).toMatchObject({ status: "FINALIZED", terminalOutcome: "SOLD_OUT" });

    const expired = await createSession(primary, "stadium-opening");
    await prisma.practiceSession.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    const expiry = await primary.agent.get(`/api/v1/sessions/${expired.id}`);
    expect(expiry.body.attempt).toMatchObject({ outcome: "EXPIRED", failureReason: "SESSION_EXPIRED" });
    expect(expiry.body.attempt.allocatedQuantity).toBe(0);
  });

  it("wins a competitive allocation and persists requested, allocated, and remaining quantities", async () => {
    const session = await createSession(primary, "summer-festival-drop");
    expect((await action(primary, session.id, { type: "SELECT_CATEGORY", categoryId: "general" })).status).toBe(200);
    expect((await action(primary, session.id, { type: "SELECT_QUANTITY", quantity: 1 })).status).toBe(200);
    expect((await action(primary, session.id, { type: "COMPLETE_VERIFICATION" })).status).toBe(200);
    const response = await primary.agent.post(`/api/v1/sessions/${session.id}/submit`).set("X-CSRF-Token", primary.csrf).send({});
    expect(response.status).toBe(201);
    expect(response.body.attempt).toMatchObject({ outcome: "CONFIRMED", requestedQuantity: 1, allocatedQuantity: 1 });
    expect(response.body.attempt.inventoryRemainingAtOutcome).toBeLessThan(72);
    expect(response.body.attempt.timeline.some((event: { type: string }) => event.type === "USER_ALLOCATION")).toBe(true);
  });

  it("records inventory exhaustion before the deadline and returns the existing result on a retry", async () => {
    const session = await createSession(primary, "last-ticket-rush");
    const first = await action(primary, session.id, { type: "SELECT_CATEGORY", categoryId: "last-seat" });
    expect(first.body.attempt).toMatchObject({ outcome: "SOLD_OUT", failureReason: "INVENTORY_EXHAUSTED", requestedQuantity: null, allocatedQuantity: 0, inventoryRemainingAtOutcome: 0, inventoryExhaustedAtMs: 0 });
    const retry = await primary.agent.post(`/api/v1/sessions/${session.id}/submit`).set("X-CSRF-Token", primary.csrf).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.attempt.id).toBe(first.body.attempt.id);
  });

  it("rejects over-allocation without partially allocating inventory", async () => {
    const session = await createSession(primary, "small-club-drop");
    await action(primary, session.id, { type: "SELECT_CATEGORY", categoryId: "club" });
    await action(primary, session.id, { type: "SELECT_QUANTITY", quantity: 3 });
    await action(primary, session.id, { type: "COMPLETE_VERIFICATION" });
    const response = await primary.agent.post(`/api/v1/sessions/${session.id}/submit`).set("X-CSRF-Token", primary.csrf).send({});
    expect(response.body.attempt).toMatchObject({ outcome: "SOLD_OUT", failureReason: "INVENTORY_EXHAUSTED", requestedQuantity: 3, allocatedQuantity: 0, inventoryRemainingAtOutcome: 2 });
  });

  it("rejects scenario version mutation at the database boundary", async () => {
    const version = await prisma.scenarioVersion.findFirstOrThrow({ where: { scenario: { slug: "stadium-opening" } } });
    await expect(prisma.scenarioVersion.update({ where: { id: version.id }, data: { difficulty: "MUTATED" } })).rejects.toThrow();
    expect((await prisma.scenarioVersion.findUniqueOrThrow({ where: { id: version.id } })).difficulty).toBe(version.difficulty);
  });
});
