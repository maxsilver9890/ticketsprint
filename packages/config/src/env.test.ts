import { describe, expect, it } from "vitest";
import { getQueueApiEnv, resolveQueueApiPort, validateApiEnv } from "./env.js";

const validEnv = {
  NODE_ENV: "test",
  API_PORT: "4000",
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "test-secret-with-more-than-thirty-two-characters",
};

describe("API environment validation", () => {
  it("accepts valid configuration and coerces the port", () => {
    const result = validateApiEnv(validEnv);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.API_PORT).toBe(4000);
  });
  it("rejects a missing or short JWT secret", () => {
    expect(
      validateApiEnv({ ...validEnv, JWT_SECRET: "too-short" }).success,
    ).toBe(false);
  });
});

describe("Queue Rush environment validation", () => {
  it("prefers Render PORT and falls back to local API_PORT", () => {
    const local = getQueueApiEnv({});
    expect(local.PORT).toBeUndefined();
    expect(local.API_PORT).toBe(4000);
    expect(local.WEB_ORIGIN).toBe("http://localhost:3000");
    expect(resolveQueueApiPort(local)).toBe(4000);

    const render = getQueueApiEnv({
      PORT: "10000",
      API_PORT: "4000",
      WEB_ORIGIN: "https://ticketsprint-omega.vercel.app",
    });
    expect(render.PORT).toBe(10000);
    expect(render.API_PORT).toBe(4000);
    expect(resolveQueueApiPort(render)).toBe(10000);
  });

  it.each(["0", "65536", "not-a-port"])("rejects invalid Render PORT %s", (PORT) => {
    expect(() =>
      getQueueApiEnv({ PORT, WEB_ORIGIN: "http://localhost:3000" }),
    ).toThrow();
  });
});
