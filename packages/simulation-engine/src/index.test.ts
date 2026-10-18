import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bookingScenarioConfigSchema, type BookingScenarioConfig } from "@ticketsprint/contracts/booking";
import { advanceBooking, BookingTransitionError, compareEvents, createBuyerSchedule, initialProgress, simulateCompetitiveDrop } from "./index.js";

const standard: BookingScenarioConfig = {
  type: "STANDARD", version: 1, bookingDeadlineMs: 1000, waitingRoomMs: 0, requiresSeatSelection: true, requiresVerification: true, maxQuantity: 4,
  categories: [{ id: "floor", label: "Floor", priceCents: 5000, inventory: 2, maxQuantity: 2, seatIds: ["F-1", "F-2"] }],
  soldOutMessages: ["Sold out."],
};
const competitive: Extract<BookingScenarioConfig, { type: "COMPETITIVE_DROP" }> = {
  type: "COMPETITIVE_DROP", version: 1, bookingDeadlineMs: 1000, engineVersion: "competitive-drop-v1", equalTimestampPriority: "BUYERS_BEFORE_USER",
  waitingRoomMs: 0, requiresSeatSelection: false, requiresVerification: false, maxQuantity: 4,
  categories: [{ id: "floor", label: "Floor", priceCents: 5000, inventory: 5, maxQuantity: 4 }],
  virtualBuyerProfiles: [{ profile: "FAST", count: 2, arrivalMinMs: 100, arrivalMaxMs: 200, quantityMin: 1, quantityMax: 2 }], soldOutMessages: ["Sold out."],
};
const actionId = () => randomUUID();

describe("booking scenario configuration", () => {
  it("accepts immutable standard and competitive configurations", () => {
    expect(bookingScenarioConfigSchema.parse(standard).type).toBe("STANDARD");
    expect(bookingScenarioConfigSchema.parse(competitive).type).toBe("COMPETITIVE_DROP");
  });
  it("rejects duplicate categories and seat lists inconsistent with inventory", () => {
    expect(bookingScenarioConfigSchema.safeParse({ ...standard, categories: [...standard.categories, standard.categories[0]] }).success).toBe(false);
    expect(bookingScenarioConfigSchema.safeParse({ ...standard, categories: [{ ...standard.categories[0], inventory: 3 }] }).success).toBe(false);
  });
  it("rejects invalid buyer timing and demand", () => {
    expect(bookingScenarioConfigSchema.safeParse({ ...competitive, virtualBuyerProfiles: [{ ...competitive.virtualBuyerProfiles[0], arrivalMinMs: 20, arrivalMaxMs: 10 }] }).success).toBe(false);
  });
});

describe("booking state machine", () => {
  it("accepts the complete standard workflow", () => {
    let progress = initialProgress(true);
    progress = advanceBooking(progress, { type: "SELECT_CATEGORY", categoryId: "floor", clientEventId: actionId() }, standard);
    progress = advanceBooking(progress, { type: "SELECT_QUANTITY", quantity: 2, clientEventId: actionId() }, standard);
    expect(progress.stage).toBe("QUANTITY_SELECTED");
    progress = advanceBooking(progress, { type: "SELECT_SEATS", seatIds: ["F-1", "F-2"], clientEventId: actionId() }, standard);
    expect(progress.stage).toBe("VERIFICATION");
    progress = advanceBooking(progress, { type: "COMPLETE_VERIFICATION", clientEventId: actionId() }, standard);
    expect(progress.stage).toBe("REVIEW");
  });
  it("rejects invalid step order, unknown category, and changes after terminal state", () => {
    const progress = initialProgress(true);
    expect(() => advanceBooking(progress, { type: "SELECT_QUANTITY", quantity: 1, clientEventId: actionId() }, standard)).toThrow(BookingTransitionError);
    expect(() => advanceBooking(progress, { type: "SELECT_CATEGORY", categoryId: "unknown", clientEventId: actionId() }, standard)).toThrow(/not available/);
    expect(() => advanceBooking({ ...progress, stage: "REVIEW" }, { type: "SELECT_CATEGORY", categoryId: "floor", clientEventId: actionId() }, standard)).toThrow(/sale is open/);
  });
  it("rejects out-of-range quantities, non-unique seats, and seat IDs outside the selected category", () => {
    const selected = advanceBooking(initialProgress(true), { type: "SELECT_CATEGORY", categoryId: "floor", clientEventId: actionId() }, standard);
    expect(() => advanceBooking(selected, { type: "SELECT_QUANTITY", quantity: 3, clientEventId: actionId() }, standard)).toThrow(/limit/);
    const quantity = advanceBooking(selected, { type: "SELECT_QUANTITY", quantity: 2, clientEventId: actionId() }, standard);
    expect(() => advanceBooking(quantity, { type: "SELECT_SEATS", seatIds: ["F-1", "F-1"], clientEventId: actionId() }, standard)).toThrow(/distinct seats/);
    expect(() => advanceBooking(quantity, { type: "SELECT_SEATS", seatIds: ["F-1", "X-1"], clientEventId: actionId() }, standard)).toThrow(/distinct seats/);
  });
  it("rejects actions while waiting for the sale to open", () => {
    expect(() => advanceBooking(initialProgress(false), { type: "SELECT_CATEGORY", categoryId: "floor", clientEventId: actionId() }, standard)).toThrow(/sale is open/);
  });
});

describe("deterministic competitive drop engine", () => {
  it("reproduces buyer schedules for a fixed seed", () => {
    expect(createBuyerSchedule(competitive, "fixed-seed")).toEqual(createBuyerSchedule(competitive, "fixed-seed"));
    expect(createBuyerSchedule(competitive, "fixed-seed")).not.toEqual(createBuyerSchedule(competitive, "other-seed"));
  });
  it("orders equal-time events by priority and stable sequence", () => {
    expect(compareEvents({ simulatedTimeMs: 10, priority: 0, sequenceNumber: 3 }, { simulatedTimeMs: 10, priority: 1, sequenceNumber: 1 })).toBeLessThan(0);
    expect(compareEvents({ simulatedTimeMs: 10, priority: 0, sequenceNumber: 1 }, { simulatedTimeMs: 10, priority: 0, sequenceNumber: 3 })).toBeLessThan(0);
  });
  it.each([[999, "CONFIRMED"], [1000, "SOLD_OUT"], [1001, "SOLD_OUT"]] as const)("applies strict deadline semantics at %ims", (elapsedMs, expected) => {
    const result = simulateCompetitiveDrop({ ...competitive, virtualBuyerProfiles: [] }, "deadline", { elapsedMs, bookingDeadlineMs: 1000, sessionLifetimeMs: 5000 }, { categoryId: "floor", quantity: 1 });
    expect(result.outcome).toBe(expected);
    expect(result.failureReason).toBe(expected === "CONFIRMED" ? null : "DEADLINE_MISSED");
  });
  it("expires at the maximum session lifetime when it comes first", () => {
    const result = simulateCompetitiveDrop({ ...competitive, virtualBuyerProfiles: [] }, "expired", { elapsedMs: 500, bookingDeadlineMs: 1000, sessionLifetimeMs: 500 }, null);
    expect(result).toMatchObject({ outcome: "EXPIRED", failureReason: "SESSION_EXPIRED" });
  });
  it("allocates the complete request or none when remaining inventory is insufficient", () => {
    const won = simulateCompetitiveDrop(competitive, "same-seed", { elapsedMs: 0, bookingDeadlineMs: 1000, sessionLifetimeMs: 5000 }, { categoryId: "floor", quantity: 4 });
    expect(won).toMatchObject({ outcome: "CONFIRMED", allocatedQuantity: 4, inventoryRemaining: 1 });
    const lost = simulateCompetitiveDrop(competitive, "same-seed", { elapsedMs: 0, bookingDeadlineMs: 1000, sessionLifetimeMs: 5000 }, { categoryId: "floor", quantity: 6 });
    expect(lost).toMatchObject({ outcome: "SOLD_OUT", failureReason: "INVENTORY_EXHAUSTED", allocatedQuantity: 0 });
  });
  it("rejects a user at an equal timestamp after buyers claim the inventory", () => {
    const config = { ...competitive, categories: [{ ...competitive.categories[0]!, inventory: 2 }], virtualBuyerProfiles: [{ profile: "FAST" as const, count: 2, arrivalMinMs: 10, arrivalMaxMs: 10, quantityMin: 1, quantityMax: 1 }] };
    const result = simulateCompetitiveDrop(config, "tie", { elapsedMs: 10, bookingDeadlineMs: 1000, sessionLifetimeMs: 5000 }, { categoryId: "floor", quantity: 1 });
    expect(result).toMatchObject({ outcome: "SOLD_OUT", failureReason: "INVENTORY_EXHAUSTED", allocatedQuantity: 0, inventoryRemaining: 0, inventoryExhaustedAtMs: 10 });
  });
  it("is reproducible across repeated outcomes and never allocates on expiry", () => {
    const limits = { elapsedMs: 200, bookingDeadlineMs: 1000, sessionLifetimeMs: 5000 };
    expect(simulateCompetitiveDrop(competitive, "repeatable", limits, { categoryId: "floor", quantity: 1 })).toEqual(simulateCompetitiveDrop(competitive, "repeatable", limits, { categoryId: "floor", quantity: 1 }));
    const expired = simulateCompetitiveDrop({ ...competitive, virtualBuyerProfiles: [] }, "expired", { elapsedMs: 5000, bookingDeadlineMs: 10000, sessionLifetimeMs: 5000 }, { categoryId: "floor", quantity: 1 });
    expect(expired).toMatchObject({ outcome: "EXPIRED", allocatedQuantity: 0 });
  });
});
