import {
  queueRushDropSchema,
  type QueueRushDifficulty,
  type QueueRushDrop,
  type QueueRushGameView,
} from "@ticketsprint/contracts/queue-rush";

export const queueRushDrops: QueueRushDrop[] = [
  {
    slug: "stadium-opening",
    title: "Stadium Opening Night",
    artist: "The Daybreaks",
    date: "Saturday, November 14, 2026",
    doors: "7:30 PM",
    venue: "Meridian Park",
    location: "Port Meridian",
    format: "Stadium show · One night only",
    description:
      "A first-night stadium set built for big choruses, bright lights, and a little friendly booking pressure.",
    theme: "stadium",
    priceCents: 8500,
  },
  {
    slug: "summer-festival-drop",
    title: "Northstar Weekender",
    artist: "Northstar Weekender",
    date: "Friday–Sunday, August 20–22, 2027",
    doors: "Gates at 2:00 PM",
    venue: "Juniper Fields",
    location: "Redwood Bay",
    format: "Three-day music festival",
    description:
      "Three open-air days of discovery and a finite simulated drop for general and premium entry.",
    theme: "festival",
    priceCents: 14500,
  },
  {
    slug: "last-ticket-rush",
    title: "Last Ticket Rush",
    artist: "Velvet Static",
    date: "Friday, December 18, 2026",
    doors: "8:00 PM",
    venue: "The Nightjar",
    location: "Brooklyn, New York",
    format: "Intimate club show · Limited capacity",
    description:
      "A deliberately tiny room where fast bots can claim the best spots before you.",
    theme: "night",
    priceCents: 6500,
  },
  {
    slug: "small-club-drop",
    title: "Small Club Drop",
    artist: "Paper Satellites",
    date: "Saturday, November 7, 2026",
    doors: "8:30 PM",
    venue: "The Glasshouse Room",
    location: "Chicago, Illinois",
    format: "Club show · General admission",
    description:
      "A close-up club set where every seat is a small win against the rush.",
    theme: "club",
    priceCents: 5200,
  },
].map((drop) => queueRushDropSchema.parse(drop));

export type QueueRushSeat = {
  id: string;
  sectionId: string;
  sectionName: string;
  row: string;
  number: number;
};
type BotClaimEvent = {
  atMs: number;
  sequence: number;
  botId: string;
  seatsToClaim: number;
  preferences: string[];
};
export type QueueRushGame = {
  id: string;
  drop: QueueRushDrop;
  difficulty: QueueRushDifficulty;
  seed: string;
  createdAtMs: number;
  stage: "QUEUING" | "SEAT_SELECTION" | "CHECKOUT" | "WON" | "LOST";
  seats: QueueRushSeat[];
  botsAhead: number;
  queueStepMs: number;
  queuePosition: number;
  admittedAtMs: number | null;
  playWindowMs: number;
  holdDurationMs: number;
  botSchedule: BotClaimEvent[];
  nextBotIndex: number;
  claimedSeatIds: string[];
  selectedSeatIds: string[];
  heldSeatIds: string[];
  holdExpiresAtMs: number | null;
  selectionMs: number | null;
  checkoutStartedAtMs: number | null;
  terminalAtMs: number | null;
  failureReason: "INVENTORY_EXHAUSTED" | "TIME_LIMIT" | null;
  paymentOutcome: "APPROVED" | null;
  notice: string | null;
};

export class QueueRushRuleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const queueRushRules: Record<
  QueueRushDifficulty,
  {
    botsAhead: number;
    queueStepMs: number;
    botCount: number;
    firstClaimMs: number;
    botIntervalMs: number;
    minClaim: number;
    maxClaim: number;
    playWindowMs: number;
    holdDurationMs: number;
  }
> = {
  EASY: {
    botsAhead: 2,
    queueStepMs: 1600,
    botCount: 22,
    firstClaimMs: 1000,
    botIntervalMs: 3000,
    minClaim: 1,
    maxClaim: 2,
    playWindowMs: 65_000,
    holdDurationMs: 20_000,
  },
  MEDIUM: {
    botsAhead: 5,
    queueStepMs: 1100,
    botCount: 44,
    firstClaimMs: 350,
    botIntervalMs: 1100,
    minClaim: 1,
    maxClaim: 3,
    playWindowMs: 45_000,
    holdDurationMs: 12_000,
  },
  HARD: {
    botsAhead: 9,
    queueStepMs: 600,
    botCount: 82,
    firstClaimMs: 150,
    // Spread Hard's 82 deterministic bot arrivals across roughly the full sale
    // window instead of draining their one-shot schedule in the first 8s.
    botIntervalMs: 400,
    minClaim: 2,
    maxClaim: 3,
    playWindowMs: 30_000,
    holdDurationMs: 8_000,
  },
};

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function createQueueRushSeats(): QueueRushSeat[] {
  const sections = [
    { id: "FL", name: "Floor" },
    { id: "LB", name: "Lower bowl" },
    { id: "UB", name: "Upper bowl" },
  ];
  return sections
    .flatMap((section) =>
      Array.from({ length: 6 }, (_, rowIndex) => {
        const row = String.fromCharCode(65 + rowIndex);
        return Array.from({ length: 12 }, (_, seatIndex) => ({
          id: `${section.id}-${row}${String(seatIndex + 1).padStart(2, "0")}`,
          sectionId: section.id,
          sectionName: section.name,
          row,
          number: seatIndex + 1,
        }));
      }),
    )
    .flat();
}

export function createBotClaimSchedule(
  seed: string,
  seats: QueueRushSeat[],
  difficulty: QueueRushDifficulty,
): BotClaimEvent[] {
  const rules = queueRushRules[difficulty];
  const random = seededRandom(seed);
  return Array.from({ length: rules.botCount }, (_, index) => ({
    atMs:
      rules.firstClaimMs +
      index * rules.botIntervalMs +
      Math.floor(random() * Math.max(1, rules.botIntervalMs / 2)),
    sequence: index + 1,
    botId: `bot-${String(index + 1).padStart(3, "0")}`,
    seatsToClaim:
      rules.minClaim +
      Math.floor(random() * (rules.maxClaim - rules.minClaim + 1)),
    preferences: shuffle(
      seats.map((seat) => seat.id),
      random,
    ),
  })).sort((a, b) => a.atMs - b.atMs || a.sequence - b.sequence);
}

export function createQueueRushGame(input: {
  id: string;
  dropSlug: string;
  difficulty: QueueRushDifficulty;
  seed: string;
  nowMs: number;
}): QueueRushGame {
  const drop = queueRushDrops.find(
    (candidate) => candidate.slug === input.dropSlug,
  );
  if (!drop)
    throw new QueueRushRuleError(
      404,
      "DROP_NOT_FOUND",
      "That practice drop is not available.",
    );
  const rules = queueRushRules[input.difficulty];
  const seats = createQueueRushSeats();
  return {
    id: input.id,
    drop,
    difficulty: input.difficulty,
    seed: input.seed,
    createdAtMs: input.nowMs,
    stage: "QUEUING",
    seats,
    botsAhead: rules.botsAhead,
    queueStepMs: rules.queueStepMs,
    queuePosition: rules.botsAhead + 1,
    admittedAtMs: null,
    playWindowMs: rules.playWindowMs,
    holdDurationMs: rules.holdDurationMs,
    botSchedule: createBotClaimSchedule(input.seed, seats, input.difficulty),
    nextBotIndex: 0,
    claimedSeatIds: [],
    selectedSeatIds: [],
    heldSeatIds: [],
    holdExpiresAtMs: null,
    selectionMs: null,
    checkoutStartedAtMs: null,
    terminalAtMs: null,
    failureReason: null,
    paymentOutcome: null,
    notice: null,
  };
}

function lose(
  game: QueueRushGame,
  atMs: number,
  failureReason: "INVENTORY_EXHAUSTED" | "TIME_LIMIT",
): QueueRushGame {
  return {
    ...game,
    stage: "LOST",
    terminalAtMs: atMs,
    failureReason,
    heldSeatIds: [],
    selectedSeatIds: [],
    holdExpiresAtMs: null,
    paymentOutcome: null,
    notice: null,
  };
}

export function advanceQueueRush(
  game: QueueRushGame,
  nowMs: number,
): QueueRushGame {
  if (game.stage === "WON" || game.stage === "LOST") return game;
  const next = {
    ...game,
    claimedSeatIds: [...game.claimedSeatIds],
    heldSeatIds: [...game.heldSeatIds],
    selectedSeatIds: [...game.selectedSeatIds],
  };
  const elapsed = Math.max(0, nowMs - game.createdAtMs);
  const admissionAtMs = next.createdAtMs + next.botsAhead * next.queueStepMs;
  if (next.admittedAtMs === null) {
    const passed = Math.min(
      next.botsAhead,
      Math.floor(elapsed / next.queueStepMs),
    );
    next.queuePosition = next.botsAhead - passed + 1;
  }
  const deadlineAt =
    next.admittedAtMs === null
      ? Number.POSITIVE_INFINITY
      : next.admittedAtMs + next.playWindowMs;
  while (true) {
    const event = next.botSchedule[next.nextBotIndex];
    const botAt =
      event
        ? next.createdAtMs + event.atMs
        : Number.POSITIVE_INFINITY;
    const admitAt =
      next.admittedAtMs === null
        ? admissionAtMs
        : Number.POSITIVE_INFINITY;
    const holdAt = next.holdExpiresAtMs ?? Number.POSITIVE_INFINITY;
    const eventAt = Math.min(botAt, admitAt, holdAt, deadlineAt);
    if (eventAt > nowMs) break;
    // Event priority at the same simulated timestamp: bots, admission, hold
    // expiry, deadline. Player actions are applied after this function returns,
    // so a same-time bot claim always wins a contested seat.
    if (botAt === eventAt) {
      next.nextBotIndex += 1;
      let seatsRemaining = event!.seatsToClaim;
      for (const preference of event!.preferences) {
        if (
          next.claimedSeatIds.length + next.heldSeatIds.length >=
            next.seats.length ||
          seatsRemaining <= 0
        )
          break;
        if (
          next.claimedSeatIds.includes(preference) ||
          next.heldSeatIds.includes(preference)
        )
          continue;
        next.claimedSeatIds.push(preference);
        seatsRemaining -= 1;
      }
      if (next.claimedSeatIds.length >= next.seats.length)
        return lose(next, eventAt, "INVENTORY_EXHAUSTED");
      continue;
    }
    if (admitAt === eventAt) {
      next.admittedAtMs = admissionAtMs;
      next.queuePosition = 0;
      next.stage = "SEAT_SELECTION";
      continue;
    }
    if (holdAt === eventAt) {
      next.heldSeatIds = [];
      next.selectedSeatIds = [];
      next.holdExpiresAtMs = null;
      next.checkoutStartedAtMs = null;
      next.stage = "SEAT_SELECTION";
      next.notice = "Your seat hold expired. The seats are back on the map.";
      if (next.claimedSeatIds.length >= next.seats.length)
        return lose(next, eventAt, "INVENTORY_EXHAUSTED");
      continue;
    }
    return lose(next, deadlineAt, "TIME_LIMIT");
  }
  return next;
}

export function holdQueueRushSeats(
  game: QueueRushGame,
  seatIds: string[],
  nowMs: number,
): QueueRushGame {
  const current = selectQueueRushSeats(game, seatIds, nowMs);
  if (current.stage !== "SEAT_SELECTION" || current.admittedAtMs === null)
    throw new QueueRushRuleError(
      409,
      "SEAT_SELECTION_CLOSED",
      "Seat selection is not open for this game.",
    );
  if (current.selectedSeatIds.length === 0)
    throw new QueueRushRuleError(
      400,
      "INVALID_SEAT_SELECTION",
      "Choose between one and four different seats.",
    );
  return {
    ...current,
    stage: "CHECKOUT",
    checkoutStartedAtMs: nowMs,
    notice: null,
  };
}

/**
 * Update the player's desired seats while keeping every accepted seat held on
 * the authoritative game. The first selection starts the hold clock; adding
 * seats never silently renews it.
 */
export function selectQueueRushSeats(
  game: QueueRushGame,
  seatIds: string[],
  nowMs: number,
): QueueRushGame {
  const current = advanceQueueRush(game, nowMs);
  if (current.stage !== "SEAT_SELECTION" || current.admittedAtMs === null)
    throw new QueueRushRuleError(
      409,
      "SEAT_SELECTION_CLOSED",
      "Seat selection is not open for this game.",
    );
  if (seatIds.length > 4 || new Set(seatIds).size !== seatIds.length)
    throw new QueueRushRuleError(
      400,
      "INVALID_SEAT_SELECTION",
      "Choose up to four different seats.",
    );
  const validIds = new Set(current.seats.map((seat) => seat.id));
  if (seatIds.some((id) => !validIds.has(id)))
    throw new QueueRushRuleError(
      422,
      "SEAT_UNAVAILABLE",
      "One or more selected seats are not in this venue.",
    );
  const previouslyHeld = new Set(current.heldSeatIds);
  if (
    seatIds.some(
      (id) =>
        current.claimedSeatIds.includes(id) && !previouslyHeld.has(id),
    )
  )
    throw new QueueRushRuleError(
      409,
      "SEAT_UNAVAILABLE",
      "A bot just claimed one of those seats. Your active seat holds remain secured; choose another available seat.",
    );

  if (seatIds.length === 0) {
    return {
      ...current,
      selectedSeatIds: [],
      heldSeatIds: [],
      holdExpiresAtMs: null,
      selectionMs: null,
      notice: null,
    };
  }

  const rules = queueRushRules[current.difficulty];
  const holdExpiresAtMs =
    current.holdExpiresAtMs ??
    Math.min(
      nowMs + rules.holdDurationMs,
      current.admittedAtMs + current.playWindowMs,
    );
  if (holdExpiresAtMs <= nowMs)
    throw new QueueRushRuleError(
      409,
      "HOLD_EXPIRED",
      "Your seat hold expired. Choose available seats to continue.",
    );
  return {
    ...current,
    selectedSeatIds: [...seatIds],
    heldSeatIds: [...seatIds],
    holdExpiresAtMs,
    selectionMs:
      current.selectionMs ?? Math.max(0, nowMs - current.admittedAtMs),
    notice: null,
  };
}

export function abandonQueueRushCheckout(
  game: QueueRushGame,
  nowMs: number,
): QueueRushGame {
  const current = advanceQueueRush(game, nowMs);
  if (current.stage !== "CHECKOUT") return current;
  if (current.claimedSeatIds.length >= current.seats.length)
    return lose(current, nowMs, "INVENTORY_EXHAUSTED");
  return {
    ...current,
    stage: "SEAT_SELECTION",
    selectedSeatIds: [],
    heldSeatIds: [],
    holdExpiresAtMs: null,
    checkoutStartedAtMs: null,
    notice: "Checkout closed. Your held seats have been released.",
  };
}

export function payQueueRush(
  game: QueueRushGame,
  nowMs: number,
): { game: QueueRushGame; duplicate: boolean } {
  const current = advanceQueueRush(game, nowMs);
  if (current.stage === "WON") return { game: current, duplicate: true };
  if (current.stage === "LOST") return { game: current, duplicate: true };
  if (
    current.stage !== "CHECKOUT" ||
    current.heldSeatIds.length === 0 ||
    current.holdExpiresAtMs === null
  ) {
    throw new QueueRushRuleError(
      409,
      "NO_ACTIVE_SEAT_HOLD",
      "Your seat hold is no longer active. Choose available seats to continue.",
    );
  }
  if (nowMs >= current.holdExpiresAtMs)
    throw new QueueRushRuleError(
      409,
      "HOLD_EXPIRED",
      "Your seat hold expired before checkout. The seats have been released.",
    );
  return {
    game: {
      ...current,
      stage: "WON",
      terminalAtMs: nowMs,
      failureReason: null,
      paymentOutcome: "APPROVED",
      holdExpiresAtMs: null,
      notice: null,
    },
    duplicate: false,
  };
}

export function queueRushGameView(
  game: QueueRushGame,
  nowMs: number,
): QueueRushGameView {
  const current = advanceQueueRush(game, nowMs);
  const viewNowMs = Math.min(nowMs, current.terminalAtMs ?? nowMs);
  const deadlineAtMs =
    current.admittedAtMs === null
      ? null
      : current.admittedAtMs + current.playWindowMs;
  const queueMs =
    current.admittedAtMs === null
      ? null
      : current.admittedAtMs - current.createdAtMs;
  const checkoutMs =
    current.checkoutStartedAtMs === null
      ? null
      : Math.max(
          0,
          (current.terminalAtMs ?? nowMs) - current.checkoutStartedAtMs,
        );
  const completionMs =
    current.terminalAtMs === null
      ? null
      : Math.max(0, current.terminalAtMs - current.createdAtMs);
  const passed =
    current.admittedAtMs === null
      ? Math.min(
          current.botsAhead,
          Math.floor(
            Math.max(0, viewNowMs - current.createdAtMs) / current.queueStepMs,
          ),
        )
      : current.botsAhead;
  const queuePercent =
    current.botsAhead === 0
      ? 100
      : Math.min(100, (passed / current.botsAhead) * 100);
  const inventoryRemaining = Math.max(
    0,
    current.seats.length -
      current.claimedSeatIds.length -
      current.heldSeatIds.length,
  );
  const seats = current.seats.map((seat) => ({
    ...seat,
    state:
      current.stage === "WON" && current.selectedSeatIds.includes(seat.id)
        ? ("SOLD" as const)
        : current.heldSeatIds.includes(seat.id)
          ? ("HELD" as const)
          : current.claimedSeatIds.includes(seat.id)
            ? ("SOLD" as const)
            : ("AVAILABLE" as const),
  }));
  return {
    id: current.id,
    drop: current.drop,
    difficulty: current.difficulty,
    stage: current.stage,
    serverNowMs: nowMs,
    queue: {
      position: current.queuePosition,
      total: current.botsAhead + 1,
      progressPercent: queuePercent,
      elapsedMs: Math.max(
        0,
        Math.min(
          current.admittedAtMs ?? current.terminalAtMs ?? nowMs,
          viewNowMs,
        ) - current.createdAtMs,
      ),
      saleStatus:
        current.claimedSeatIds.length >= current.seats.length
          ? "SOLD_OUT"
          : "ON_SALE",
      inventoryRemaining,
    },
    timing: {
      deadlineAtMs,
      holdExpiresAtMs: current.holdExpiresAtMs,
      queueMs,
      selectionMs: current.selectionMs,
      checkoutMs,
      completionMs,
      timeRemainingMs:
        deadlineAtMs === null ? 0 : Math.max(0, deadlineAtMs - nowMs),
      holdRemainingMs:
        current.holdExpiresAtMs === null
          ? 0
          : Math.max(0, current.holdExpiresAtMs - nowMs),
    },
    seats,
    botClaims: current.claimedSeatIds.length,
    selectedSeatIds: current.selectedSeatIds,
    outcome:
      current.stage === "WON"
        ? "WON"
        : current.stage === "LOST"
          ? "LOST"
          : null,
    failureReason: current.failureReason,
    notice: current.notice,
    paymentOutcome: current.paymentOutcome,
  };
}

export function queueRushDifficultySummary() {
  return Object.entries(queueRushRules).map(([difficulty, rules]) => ({
    difficulty: difficulty as QueueRushDifficulty,
    queueBots: rules.botsAhead,
    botCount: rules.botCount,
    playWindowMs: rules.playWindowMs,
    holdDurationMs: rules.holdDurationMs,
  }));
}
