import { describe, expect, it } from "vitest";
import { getQueueApiEnv, resolveQueueApiPort } from "./env.js";

describe("Queue Rush environment validation", () => {
  it("defaults to local development settings", () => {
    const env = getQueueApiEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.PORT).toBeUndefined();
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
    expect(resolveQueueApiPort(env)).toBe(4000);
  });

  it("uses Render PORT and accepts the configured Vercel origin", () => {
    const env = getQueueApiEnv({
      PORT: "10000",
      WEB_ORIGIN: "https://ticketsprint-omega.vercel.app",
    });
    expect(resolveQueueApiPort(env)).toBe(10000);
    expect(env.WEB_ORIGIN).toBe("https://ticketsprint-omega.vercel.app");
  });

  it.each(["0", "65536", "not-a-port"])("rejects invalid PORT %s", (PORT) => {
    expect(() => getQueueApiEnv({ PORT })).toThrow();
  });
});
