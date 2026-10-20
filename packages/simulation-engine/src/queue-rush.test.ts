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
  selectQueueRushSeats,
} from "./queue-rush.js";
const game = (
  difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM",
  mode: "OPEN" | "TARGET" = "OPEN",
) =>
  createQueueRushGame({
    id: "g",
    dropSlug: "stadium-opening",
    difficulty,
    mode,
    seed: "repeatable",
    nowMs: 1000,
  });
describe("Queue Rush simulation", () => {
  it("assigns two deterministic adjacent target seats in one row", () => {
    const first = game("EASY", "TARGET");
    const second = game("EASY", "TARGET");
    expect(first.targetSeatIds).toHaveLength(2);
    expect(first.targetSeatIds).toEqual(second.targetSeatIds);
    const targets = first.targetSeatIds.map((id) => first.seats.find((seat) => seat.id === id)!);
    expect(targets[0]!.sectionId).toBe(targets[1]!.sectionId);
    expect(targets[0]!.row).toBe(targets[1]!.row);
    expect(Math.abs(targets[0]!.number - targets[1]!.number)).toBe(1);
  });
  it("requires all assigned target seats and rejects other seats", () => {
    const initial = game("EASY", "TARGET");
    const admittedAt = initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const quiet = {
      ...initial,
      botSchedule: initial.botSchedule.map((event) => ({ ...event, atMs: 60_000 + event.atMs })),
    };
    const admitted = advanceQueueRush(quiet, admittedAt);
    const outsideTarget = admitted.seats.find((seat) => !admitted.targetSeatIds.includes(seat.id))!.id;
    expect(() => selectQueueRushSeats(admitted, [outsideTarget], admittedAt)).toThrow(/target mode/i);
    expect(() => holdQueueRushSeats(admitted, [admitted.targetSeatIds[0]!], admittedAt)).toThrow(/both assigned/i);
    const selected = selectQueueRushSeats(admitted, admitted.targetSeatIds, admittedAt);
    expect(holdQueueRushSeats(selected, selected.targetSeatIds, admittedAt).stage).toBe("CHECKOUT");
  });
  it("loses target mode when a bot claims an assigned seat", () => {
    const initial = game("EASY", "TARGET");
    const admittedAt = initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const claimAt = admittedAt - initial.createdAtMs;
    const event = {
      ...initial.botSchedule[0]!,
      atMs: claimAt,
      seatsToClaim: 1,
      preferences: [...initial.targetSeatIds, ...initial.seats.map((seat) => seat.id)],
    };
    const challenge = { ...initial, botSchedule: [event], nextBotIndex: 0 };
    const lost = advanceQueueRush(challenge, admittedAt);
    expect(lost.stage).toBe("LOST");
    expect(lost.failureReason).toBe("TARGET_SEATS_CLAIMED");
    expect(lost.terminalAtMs).toBe(admittedAt);
  });
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
  it("makes hard mode more competitive than medium during seat selection", () => {
    const mediumStart = game("MEDIUM");
    const hardStart = game("HARD");
    const mediumAt =
      mediumStart.createdAtMs +
      mediumStart.botsAhead * mediumStart.queueStepMs +
      20_000;
    const hardAt =
      hardStart.createdAtMs +
      hardStart.botsAhead * hardStart.queueStepMs +
      20_000;
    const medium = advanceQueueRush(mediumStart, mediumAt);
    const hard = advanceQueueRush(hardStart, hardAt);

    expect(medium.stage).toBe("SEAT_SELECTION");
    expect(hard.stage).toBe("SEAT_SELECTION");
    expect(hard.claimedSeatIds.length).toBeGreaterThan(
      medium.claimedSeatIds.length,
    );
    expect(hard.playWindowMs).toBeLessThan(mediumStart.playWindowMs);
    expect(hard.holdDurationMs).toBeLessThan(mediumStart.holdDurationMs);
  });
  it.each(["EASY", "MEDIUM", "HARD"] as const)(
    "%s bots keep claiming seats across the active sale instead of exhausting a one-shot schedule early",
    (difficulty) => {
      const initial = game(difficulty);
      const admissionAt =
        initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
      const early = advanceQueueRush(initial, admissionAt + 10_000);
      const later = advanceQueueRush(initial, admissionAt + 20_000);
      expect(early.nextBotIndex).toBeGreaterThan(0);
      expect(later.nextBotIndex).toBeGreaterThan(early.nextBotIndex);
      expect(later.claimedSeatIds.length).toBeGreaterThan(
        early.claimedSeatIds.length,
      );
      expect(later.nextBotIndex).toBeLessThan(later.botSchedule.length);
    },
  );
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
  it("admits the hard queue while seats remain under its normal bot schedule", () => {
    const g = game("HARD");
    const admissionAt = g.createdAtMs + g.botsAhead * g.queueStepMs;
    const admitted = advanceQueueRush(g, admissionAt);
    expect(admitted.stage).toBe("SEAT_SELECTION");
    expect(admitted.admittedAtMs).toBe(admissionAt);
    expect(admitted.claimedSeatIds.length).toBeGreaterThan(0);
    expect(admitted.claimedSeatIds.length).toBeLessThan(g.seats.length);
  });
  it("can still exhaust inventory before admission in an extreme deterministic queue", () => {
    const initial = game("HARD");
    const eventAtAdmission = initial.botsAhead * initial.queueStepMs;
    const overloaded = {
      ...initial,
      botSchedule: initial.botSchedule.map((event, index) => ({
        ...event,
        atMs: index * 100,
        seatsToClaim: 4,
        preferences: initial.seats.map((seat) => seat.id),
      })),
    };
    const lost = advanceQueueRush(
      overloaded,
      initial.createdAtMs + eventAtAdmission - 1,
    );
    expect(lost.stage).toBe("LOST");
    expect(lost.admittedAtMs).toBeNull();
    expect(lost.failureReason).toBe("INVENTORY_EXHAUSTED");
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
  it("holds each seat as it is added and preserves prior seats through checkout", () => {
    const initial = game("EASY");
    const admitted = advanceQueueRush(
      initial,
      initial.createdAtMs + initial.botsAhead * initial.queueStepMs,
    );
    const available = admitted.seats.filter(
      (seat) => !admitted.claimedSeatIds.includes(seat.id),
    );
    const first = selectQueueRushSeats(admitted, [available[0]!.id], admitted.admittedAtMs!);
    const firstHoldExpiry = first.holdExpiresAtMs;
    const second = selectQueueRushSeats(
      first,
      [available[0]!.id, available[1]!.id],
      admitted.admittedAtMs! + 100,
    );
    expect(second.stage).toBe("SEAT_SELECTION");
    expect(second.heldSeatIds).toEqual([available[0]!.id, available[1]!.id]);
    expect(second.holdExpiresAtMs).toBe(firstHoldExpiry);
    const checkout = holdQueueRushSeats(
      second,
      second.selectedSeatIds,
      admitted.admittedAtMs! + 200,
    );
    expect(checkout.stage).toBe("CHECKOUT");
    expect(checkout.heldSeatIds).toEqual(second.heldSeatIds);
    expect(payQueueRush(checkout, admitted.admittedAtMs! + 201).game.stage).toBe("WON");
  });
  it("keeps a held seat safe from bots and preserves existing holds on contention", () => {
    const initial = game("EASY");
    const admittedAt = initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const admitted = advanceQueueRush(initial, admittedAt);
    const available = admitted.seats.filter(
      (seat) => !admitted.claimedSeatIds.includes(seat.id),
    );
    const held = selectQueueRushSeats(admitted, [available[0]!.id], admittedAt);
    const event = {
      ...held.botSchedule[held.nextBotIndex]!,
      atMs: admittedAt - held.createdAtMs + 100,
      seatsToClaim: 1,
      preferences: [available[0]!.id, available[1]!.id],
    };
    const scheduled = {
      ...held,
      botSchedule: [...held.botSchedule.slice(0, held.nextBotIndex), event],
    };
    const afterBot = advanceQueueRush(scheduled, admittedAt + 100);
    expect(afterBot.heldSeatIds).toContain(available[0]!.id);
    expect(afterBot.claimedSeatIds).not.toContain(available[0]!.id);
    expect(afterBot.claimedSeatIds).toContain(available[1]!.id);
    expect(() =>
      selectQueueRushSeats(afterBot, [available[0]!.id, available[1]!.id], admittedAt + 100),
    ).toThrow(/active seat holds remain secured/i);
    expect(afterBot.heldSeatIds).toEqual([available[0]!.id]);
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
  it("releases a seat-selection hold at its deadline so bots may claim it", () => {
    const initial = game("EASY");
    const admittedAt = initial.createdAtMs + initial.botsAhead * initial.queueStepMs;
    const admitted = advanceQueueRush(initial, admittedAt);
    const seat = admitted.seats.find(
      (candidate) => !admitted.claimedSeatIds.includes(candidate.id),
    )!.id;
    const held = selectQueueRushSeats(admitted, [seat], admittedAt);
    const expired = advanceQueueRush(held, held.holdExpiresAtMs!);
    expect(expired.stage).toBe("SEAT_SELECTION");
    expect(expired.heldSeatIds).toEqual([]);
    expect(expired.selectedSeatIds).toEqual([]);
    expect(expired.notice).toMatch(/hold expired/i);
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
      const held =
        releaseKind === "expiry"
          ? selectQueueRushSeats(admitted, [seat], admittedAt)
          : holdQueueRushSeats(admitted, [seat], admittedAt);
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
});
