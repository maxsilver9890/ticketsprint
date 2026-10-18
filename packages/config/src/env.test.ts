import { describe, expect, it } from "vitest";
import { validateApiEnv } from "./env.js";

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
