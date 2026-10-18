import type { BookingAction, BookingScenarioConfig } from "@ticketsprint/contracts/booking";

export type BookingStage = "WAITING_ROOM" | "SALE_OPEN" | "CATEGORY_SELECTED" | "QUANTITY_SELECTED" | "SEATS_SELECTED" | "VERIFICATION" | "REVIEW";
export type BookingProgress = { stage: BookingStage; selectedCategoryId: string | null; requestedQuantity: number | null; selectedSeatIds: string[] | null };

export class BookingTransitionError extends Error {
  constructor(message: string, readonly code = "INVALID_TRANSITION") { super(message); }
}

export function initialProgress(saleOpen: boolean): BookingProgress {
  return { stage: saleOpen ? "SALE_OPEN" : "WAITING_ROOM", selectedCategoryId: null, requestedQuantity: null, selectedSeatIds: null };
}

export function advanceBooking(progress: BookingProgress, action: BookingAction, config: BookingScenarioConfig): BookingProgress {
  const next = { ...progress };
  if (action.type === "SELECT_CATEGORY") {
    if (progress.stage !== "SALE_OPEN") throw new BookingTransitionError("Choose a category when the sale is open.");
    if (!config.categories.some((category) => category.id === action.categoryId)) throw new BookingTransitionError("That ticket category is not available.", "CATEGORY_UNAVAILABLE");
    next.stage = "CATEGORY_SELECTED";
    next.selectedCategoryId = action.categoryId;
    return next;
  }
  if (action.type === "SELECT_QUANTITY") {
    if (progress.stage !== "CATEGORY_SELECTED" || !progress.selectedCategoryId) throw new BookingTransitionError("Choose a category before setting a quantity.");
    const category = config.categories.find((candidate) => candidate.id === progress.selectedCategoryId)!;
    if (action.quantity > Math.min(config.maxQuantity, category.maxQuantity)) throw new BookingTransitionError("That quantity is over the scenario limit.", "QUANTITY_OUT_OF_RANGE");
    next.stage = config.requiresSeatSelection ? "QUANTITY_SELECTED" : config.requiresVerification ? "VERIFICATION" : "REVIEW";
    next.requestedQuantity = action.quantity;
    next.selectedSeatIds = null;
    return next;
  }
  if (action.type === "SELECT_SEATS") {
    if (progress.stage !== "QUANTITY_SELECTED" || !progress.selectedCategoryId || !progress.requestedQuantity || !config.requiresSeatSelection) throw new BookingTransitionError("Choose a quantity before selecting seats.");
    const category = config.categories.find((candidate) => candidate.id === progress.selectedCategoryId)!;
    const seats = category.seatIds ?? [];
    if (action.seatIds.length !== progress.requestedQuantity || new Set(action.seatIds).size !== action.seatIds.length || action.seatIds.some((seat) => !seats.includes(seat))) {
      throw new BookingTransitionError("Select the requested number of distinct seats from this category.", "INVALID_SEAT_SELECTION");
    }
    next.stage = config.requiresVerification ? "VERIFICATION" : "REVIEW";
    next.selectedSeatIds = [...action.seatIds].sort();
    return next;
  }
  if (progress.stage !== "VERIFICATION" || !config.requiresVerification) throw new BookingTransitionError("Verification is not the current booking stage.");
  next.stage = "REVIEW";
  return next;
}

export type BuyerEvent = {
  type: "VIRTUAL_BUYER";
  buyerId: string;
  profile: "FAST" | "AVERAGE" | "SLOW" | "ERRATIC";
  categoryId: string;
  quantity: number;
  simulatedTimeMs: number;
  sequenceNumber: number;
  priority: 0;
};
export type DropUserPurchase = { categoryId: string; quantity: number };
export type BuyerTimelineEvent = BuyerEvent & { result: "ALLOCATED" | "INSUFFICIENT_INVENTORY" };
export type DropResult = {
  outcome: "CONFIRMED" | "SOLD_OUT" | "EXPIRED";
  failureReason: "DEADLINE_MISSED" | "INVENTORY_EXHAUSTED" | "SESSION_EXPIRED" | null;
  allocatedQuantity: number;
  inventoryRemaining: number;
  inventoryByCategory: Record<string, number>;
  inventoryExhaustedAtMs: number | null;
  timeline: BuyerTimelineEvent[];
};

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function compareEvents(a: { simulatedTimeMs: number; priority: number; sequenceNumber: number }, b: { simulatedTimeMs: number; priority: number; sequenceNumber: number }): number {
  return a.simulatedTimeMs - b.simulatedTimeMs || a.priority - b.priority || a.sequenceNumber - b.sequenceNumber;
}

export function createBuyerSchedule(config: BookingScenarioConfig, seed: string): BuyerEvent[] {
  if (config.type !== "COMPETITIVE_DROP") return [];
  const random = seededRandom(seed);
  const events: BuyerEvent[] = [];
  let sequenceNumber = 0;
  for (const profile of config.virtualBuyerProfiles) {
    for (let index = 0; index < profile.count; index += 1) {
      const category = config.categories[Math.floor(random() * config.categories.length)]!;
      const arrivalRange = profile.arrivalMaxMs - profile.arrivalMinMs + 1;
      const quantityRange = profile.quantityMax - profile.quantityMin + 1;
      events.push({
        type: "VIRTUAL_BUYER",
        buyerId: `buyer-${String(sequenceNumber + 1).padStart(5, "0")}`,
        profile: profile.profile,
        categoryId: category.id,
        quantity: profile.quantityMin + Math.floor(random() * quantityRange),
        simulatedTimeMs: profile.arrivalMinMs + Math.floor(random() * arrivalRange),
        sequenceNumber: sequenceNumber + 1,
        priority: 0,
      });
      sequenceNumber += 1;
    }
  }
  return events.sort(compareEvents);
}

export function simulateCompetitiveDrop(
  config: Extract<BookingScenarioConfig, { type: "COMPETITIVE_DROP" }>,
  seed: string,
  limits: { elapsedMs: number; bookingDeadlineMs: number; sessionLifetimeMs: number },
  userPurchase: DropUserPurchase | null,
): DropResult {
  const schedule = createBuyerSchedule(config, seed);
  const inventory = Object.fromEntries(config.categories.map((category) => [category.id, category.inventory]));
  const timeline: BuyerTimelineEvent[] = [];
  let inventoryExhaustedAtMs: number | null = null;
  const deadlineLimitMs = Math.min(limits.bookingDeadlineMs, limits.sessionLifetimeMs);
  const isLate = limits.elapsedMs >= limits.bookingDeadlineMs;
  const isExpired = limits.elapsedMs >= limits.sessionLifetimeMs;
  const buyerCutoff = Math.min(limits.elapsedMs, deadlineLimitMs);
  const buyers = schedule.filter((event) => event.simulatedTimeMs < buyerCutoff || (!isLate && !isExpired && event.simulatedTimeMs <= limits.elapsedMs));
  for (const event of buyers) {
    const remaining = inventory[event.categoryId] ?? 0;
    const allocated = remaining >= event.quantity;
    if (allocated) inventory[event.categoryId] = remaining - event.quantity;
    timeline.push({ ...event, result: allocated ? "ALLOCATED" : "INSUFFICIENT_INVENTORY" });
    if (inventoryExhaustedAtMs === null && Object.values(inventory).every((count) => count === 0)) inventoryExhaustedAtMs = event.simulatedTimeMs;
  }
  const remainingTotal = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  const inventoryRemaining = Math.max(0, remainingTotal);
  const exhaustedBeforeLimit = inventoryExhaustedAtMs !== null && inventoryExhaustedAtMs < deadlineLimitMs;
  if (exhaustedBeforeLimit && (!userPurchase || isLate || isExpired)) {
    return { outcome: "SOLD_OUT", failureReason: "INVENTORY_EXHAUSTED", allocatedQuantity: 0, inventoryRemaining, inventoryByCategory: inventory, inventoryExhaustedAtMs, timeline };
  }
  if (isExpired || isLate) {
    if (isLate && limits.bookingDeadlineMs <= limits.sessionLifetimeMs) {
      return { outcome: "SOLD_OUT", failureReason: "DEADLINE_MISSED", allocatedQuantity: 0, inventoryRemaining, inventoryByCategory: inventory, inventoryExhaustedAtMs, timeline };
    }
    return { outcome: "EXPIRED", failureReason: "SESSION_EXPIRED", allocatedQuantity: 0, inventoryRemaining, inventoryByCategory: inventory, inventoryExhaustedAtMs, timeline };
  }
  if (!userPurchase) {
    return { outcome: "CONFIRMED", failureReason: null, allocatedQuantity: 0, inventoryRemaining, inventoryByCategory: inventory, inventoryExhaustedAtMs, timeline };
  }
  const available = inventory[userPurchase.categoryId] ?? 0;
  const allocated = available >= userPurchase.quantity;
  if (allocated) inventory[userPurchase.categoryId] = available - userPurchase.quantity;
  const finalRemaining = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  return {
    outcome: allocated ? "CONFIRMED" : "SOLD_OUT",
    failureReason: allocated ? null : "INVENTORY_EXHAUSTED",
    allocatedQuantity: allocated ? userPurchase.quantity : 0,
    inventoryRemaining: finalRemaining,
    inventoryByCategory: inventory,
    inventoryExhaustedAtMs,
    timeline,
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export * from "./queue-rush.js";
