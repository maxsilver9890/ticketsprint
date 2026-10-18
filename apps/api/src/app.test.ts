import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { createClient } from "redis";
import { createApp } from "./app.js";
import { getApiEnv } from "@ticketsprint/config/env";

const env = getApiEnv();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
const redis = createClient({ url: env.REDIS_URL });
const app = createApp(prisma, redis);
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const username = `ts_${runId}`;
const email = `phase1-${runId}@example.test`;

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("API foundation", () => {
  it("serves liveness and a request id", async () => {
    const response = await request(app).get("/api/v1/health/live");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("reports database and Redis readiness independently", async () => {
    const response = await request(app).get("/api/v1/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: "ok", redis: "error" });
  });

  it("requires a CSRF token on registration", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ username, email, password: "a-secure-phase-one-password" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
  });

  it("registers, authenticates, logs in, and logs out using cookies", async () => {
    const agent = request.agent(app);
    const tokenResponse = await agent.get("/api/v1/auth/csrf");
    const csrfToken = tokenResponse.body.csrfToken as string;
    const registration = await agent
      .post("/api/v1/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        username,
        email: email.toUpperCase(),
        password: "a-secure-phase-one-password",
      });
    expect(registration.status).toBe(201);
    expect(registration.headers["set-cookie"]).toBeDefined();
    expect(String(registration.headers["set-cookie"])).toContain("HttpOnly");
    const authenticated = await agent.get("/api/v1/auth/me");
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.user.email).toBe(email);
    const login = await agent
      .post("/api/v1/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "a-secure-phase-one-password" });
    expect(login.status).toBe(200);
    expect(
      (await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrfToken))
        .status,
    ).toBe(204);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });
});
