import { describe, expect, it } from "vitest";
import {
  advanceQueueRush,
  createBotClaimSchedule,
  createQueueRushGame,
  createQueueRushSeats,
  holdQueueRushSeats,
  payQueueRush,
  queueRushRules,
  abandonQueueRushCheckout,
  queueRushGameView,
} from "./queue-rush.js";
const game = (difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM") =>
  createQueueRushGame({
    id: "g",
    dropSlug: "stadium-opening",
    difficulty,
    seed: "repeatable",
    nowMs: 1000,
  });
describe("Queue Rush simulation", () => {
  it("reproduces bot timing and shuffled preferences for a seed", () => {
    const seats = createQueueRushSeats();
    expect(createBotClaimSchedule("x", seats, "HARD")).toEqual(
      createBotClaimSchedule("x", seats, "HARD"),
    );
    expect(createBotClaimSchedule("x", seats, "HARD")).not.toEqual(
      createBotClaimSchedule("y", seats, "HARD"),
    );
  });
  it("makes difficulty change queue, inventory pressure, timing, and holds", () => {
    expect(queueRushRules.HARD.botsAhead).toBeGreaterThan(
      queueRushRules.EASY.botsAhead,
    );
    expect(queueRushRules.HARD.botCount).toBeGreaterThan(
      queueRushRules.EASY.botCount,
    );
    expect(queueRushRules.HARD.playWindowMs).toBeLessThan(
      queueRushRules.EASY.playWindowMs,
    );
    expect(queueRushRules.HARD.holdDurationMs).toBeLessThan(
      queueRushRules.EASY.holdDurationMs,
    );
    expect(queueRushRules.HARD.botIntervalMs).toBeLessThan(
      queueRushRules.EASY.botIntervalMs,
    );
  });
  it("admits only after bots ahead and applies deterministic bot claims", () => {
    const g = game();
    expect(advanceQueueRush(g, 1000 + g.queueStepMs).stage).toBe("QUEUING");
    const ready = advanceQueueRush(g, 1000 + g.botsAhead * g.queueStepMs);
    expect(ready.stage).toBe("SEAT_SELECTION");
    expect(
      advanceQueueRush(g, ready.admittedAtMs! + 2500).claimedSeatIds,
    ).toEqual(advanceQueueRush(g, ready.admittedAtMs! + 2500).claimedSeatIds);
  });
  it("updates queue elapsed time, sale status, and inventory while the player waits", () => {
    const g = game("MEDIUM");
    const view = queueRushGameView(g, g.createdAtMs + 2_000);
    expect(view.stage).toBe("QUEUING");
    expect(view.queue.elapsedMs).toBe(2_000);
    expect(view.queue.saleStatus).toBe("ON_SALE");
    expect(view.botClaims).toBeGreaterThan(0);
    expect(view.queue.inventoryRemaining).toBeLessThan(g.seats.length);
  });
  it("can exhaust inventory before the hard queue admits the player", () => {
    const g = game("HARD");
    const admissionAt = g.createdAtMs + g.botsAhead * g.queueStepMs;
    const lost = advanceQueueRush(g, admissionAt - 1);
    expect(lost.stage).toBe("LOST");
    expect(lost.admittedAtMs).toBeNull();
    expect(lost.failureReason).toBe("INVENTORY_EXHAUSTED");
    const view = queueRushGameView(lost, admissionAt);
    expect(view.queue.saleStatus).toBe("SOLD_OUT");
    expect(view.queue.inventoryRemaining).toBe(0);
  });
  it("holds seats atomically, releases on abandon, then wins only once", () => {
    const g = advanceQueueRush(
      game("EASY"),
      1000 + queueRushRules.EASY.botsAhead * queueRushRules.EASY.queueStepMs,
    );
    const seat = g.seats.find((s) => !g.claimedSeatIds.includes(s.id))!.id;
    const held = holdQueueRushSeats(g, [seat], g.admittedAtMs!);
    expect(held.heldSeatIds).toEqual([seat]);
    expect(abandonQueueRushCheckout(held, g.admittedAtMs!).heldSeatIds).toEqual(
      [],
    );
    const retry = holdQueueRushSeats(g, [seat], g.admittedAtMs!);
    expect(payQueueRush(retry, g.admittedAtMs!).game.stage).toBe("WON");
    expect(
      payQueueRush(payQueueRush(retry, g.admittedAtMs!).game, g.admittedAtMs!)
        .duplicate,
    ).toBe(true);
  });
  it("releases an expired hold and rejects payment after expiration", () => {
    const g = advanceQueueRush(
      game("EASY"),
      1000 + queueRushRules.EASY.botsAhead * queueRushRules.EASY.queueStepMs,
    );
    const seat = g.seats.find((s) => !g.claimedSeatIds.includes(s.id))!.id;
    const held = holdQueueRushSeats(g, [seat], g.admittedAtMs!);
    const expired = advanceQueueRush(held, held.holdExpiresAtMs!);
    expect(expired.heldSeatIds).toEqual([]);
    expect(expired.stage).toBe("SEAT_SELECTION");
    expect(() => payQueueRush(held, held.holdExpiresAtMs!)).toThrow();
  });
  it.each(["expiry", "abandon"] as const)(
    "lets a later bot claim a seat released by %s",
    (releaseKind) => {
      const initial = game("EASY");
      const admittedAt =
        initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
      const admitted = advanceQueueRush(initial, admittedAt);
      const seat = admitted.seats.find(
        (candidate) => !admitted.claimedSeatIds.includes(candidate.id),
      )!.id;
      const held = holdQueueRushSeats(admitted, [seat], admittedAt);
      const releaseAt =
        releaseKind === "expiry"
          ? held.holdExpiresAtMs!
          : admittedAt + 1_000;
      const event = {
        ...held.botSchedule[0]!,
        atMs: releaseAt - held.createdAtMs + 1,
        preferences: [seat, ...held.seats.filter((s) => s.id !== seat).map((s) => s.id)],
      };
      const scheduled = { ...held, botSchedule: [event], nextBotIndex: 0 };
      const released =
        releaseKind === "expiry"
          ? advanceQueueRush(scheduled, releaseAt + 1)
          : advanceQueueRush(
              abandonQueueRushCheckout(scheduled, releaseAt),
              releaseAt + 1,
            );
      expect(released.claimedSeatIds).toContain(seat);
      expect(released.heldSeatIds).not.toContain(seat);
    },
  );
  it("gives an equal-time bot claim priority over the player's hold request", () => {
    const initial = game("EASY");
    const admittedAt =
      initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const seat = initial.seats[0]!.id;
    const event = {
      ...initial.botSchedule[0]!,
      atMs: admittedAt - initial.createdAtMs,
      seatsToClaim: 1,
      preferences: [seat, ...initial.seats.filter((s) => s.id !== seat).map((s) => s.id)],
    };
    const tied = { ...initial, botSchedule: [event], nextBotIndex: 0 };
    expect(advanceQueueRush(tied, admittedAt).claimedSeatIds).toContain(seat);
    expect(() => holdQueueRushSeats(tied, [seat], admittedAt)).toThrow(
      /claimed/i,
    );
  });
  it("does not confirm checkout at the authoritative game deadline", () => {
    const initial = game("EASY");
    const admittedAt =
      initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const admitted = advanceQueueRush(initial, admittedAt);
    const seat = admitted.seats.find(
      (candidate) => !admitted.claimedSeatIds.includes(candidate.id),
    )!.id;
    const held = holdQueueRushSeats(admitted, [seat], admittedAt + 1);
    const result = payQueueRush(
      held,
      admittedAt + admitted.playWindowMs,
    );
    expect(result.game.stage).toBe("LOST");
    expect(result.game.failureReason).toBe("TIME_LIMIT");
    expect(result.game.paymentOutcome).toBeNull();
  });
  it("ends the hard run when deterministic bots exhaust the inventory", () => {
    const g = advanceQueueRush(
      game("HARD"),
      1000 + queueRushRules.HARD.botsAhead * queueRushRules.HARD.queueStepMs,
    );
    const lost = advanceQueueRush(g, g.admittedAtMs! + g.playWindowMs);
    expect(lost.stage).toBe("LOST");
    expect(lost.failureReason).toBe("INVENTORY_EXHAUSTED");
  });
});
