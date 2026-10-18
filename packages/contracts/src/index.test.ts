import { describe, expect, it } from "vitest";
import { errorResponseSchema, liveHealthResponseSchema } from "./index.js";

describe("shared API response contracts", () => {
  it("validates live health responses", () => {
    expect(
      liveHealthResponseSchema.safeParse({
        status: "ok",
        service: "ticketsprint-api",
      }).success,
    ).toBe(true);
  });

  it("validates request-scoped API errors", () => {
    expect(
      errorResponseSchema.safeParse({
        error: { code: "NOT_FOUND", message: "Not found", requestId: "id" },
      }).success,
    ).toBe(true);
  });
});
