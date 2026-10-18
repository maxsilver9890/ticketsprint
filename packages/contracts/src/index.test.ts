import { describe, expect, it } from "vitest";
import { registerRequestSchema } from "./index.js";
describe("shared auth contracts", () => {
  it("normalizes email", () =>
    expect(
      registerRequestSchema.parse({
        username: "sprint_user",
        email: "USER@EXAMPLE.COM",
        password: "a-secure-password",
      }).email,
    ).toBe("user@example.com"));
  it("rejects weak password and extra fields", () =>
    expect(
      registerRequestSchema.safeParse({
        username: "sprint_user",
        email: "user@example.com",
        password: "short",
        userId: "client",
      }).success,
    ).toBe(false));
});
