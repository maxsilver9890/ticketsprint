import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import {
  attemptResponseSchema,
  attemptDetailResponseSchema,
  bookingScenarioConfigSchema,
  publicBookingConfigSchema,
  sessionResponseSchema,
  timelineEventSchema,
  type BookingAction,
  type BookingScenarioConfig,
} from "@ticketsprint/contracts/booking";
import {
  advanceBooking,
  BookingTransitionError,
  canonicalJson,
  simulateCompetitiveDrop,
  type BuyerTimelineEvent,
  type DropResult,
} from "@ticketsprint/simulation-engine";
import { ApiError } from "../errors.js";

const sessionInclude = {
  scenarioVersion: { include: { scenario: true } },
  events: { orderBy: { sequenceNumber: "asc" } },
  attempt: true,
} satisfies Prisma.PracticeSessionInclude;
type SessionWithRelations = Prisma.PracticeSessionGetPayload<{ include: typeof sessionInclude }>;
type Tx = Prisma.TransactionClient;

function validateVersion(version: SessionWithRelations["scenarioVersion"] | Prisma.ScenarioVersionGetPayload<{ include: { scenario: true } }>) {
  const parsed = bookingScenarioConfigSchema.safeParse(version.config);
  if (!parsed.success || version.bookingDeadlineMs !== parsed.data?.bookingDeadlineMs) {
    throw new ApiError(500, "SCENARIO_CONFIGURATION_INVALID", "This scenario is not available right now.");
  }
  const expectedHash = createHash("sha256").update(canonicalJson({ config: parsed.data, durationLimitMs: version.durationLimitMs })).digest("hex");
  if (expectedHash !== version.configHash) throw new ApiError(500, "SCENARIO_CONFIGURATION_INVALID", "This scenario is not available right now.");
  return parsed.data;
}

function publicConfig(config: BookingScenarioConfig) {
  return publicBookingConfigSchema.parse({
    type: config.type,
    waitingRoomMs: config.waitingRoomMs,
    requiresSeatSelection: config.requiresSeatSelection,
    requiresVerification: config.requiresVerification,
    maxQuantity: config.maxQuantity,
    categories: config.categories,
    soldOutMessages: config.soldOutMessages,
  });
}

function asStringArray(value: Prisma.JsonValue | null): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function toAttemptResponse(attempt: Prisma.AttemptGetPayload<Record<string, never>>) {
  const timeline = Array.isArray(attempt.resultTimeline)
    ? attempt.resultTimeline.map((item) => timelineEventSchema.parse(item))
    : [];
  return attemptResponseSchema.parse({
    id: attempt.id,
    sessionId: attempt.sessionId,
    outcome: attempt.outcome,
    failureReason: attempt.failureReason,
    requestedQuantity: attempt.requestedQuantity,
    allocatedQuantity: attempt.allocatedQuantity,
    inventoryRemainingAtOutcome: attempt.inventoryRemainingAtOutcome,
    inventoryExhaustedAtMs: attempt.inventoryExhaustedAtMs,
    completionMs: attempt.completionMs,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    timeline,
  });
}

function toSessionResponse(session: SessionWithRelations) {
  const config = validateVersion(session.scenarioVersion);
  const saleOpenedAt = session.saleOpenedAt ?? new Date(session.startedAt.getTime() + config.waitingRoomMs);
  return sessionResponseSchema.parse({
    id: session.id,
    status: session.status,
    stage: session.stage,
    terminalAttemptId: session.attempt?.id ?? null,
    scenario: {
      id: session.scenarioVersion.scenario.id,
      slug: session.scenarioVersion.scenario.slug,
      title: session.scenarioVersion.scenario.title,
      version: session.scenarioVersion.version,
      config: publicConfig(config),
    },
    selectedCategoryId: session.selectedCategoryId,
    requestedQuantity: session.requestedQuantity,
    selectedSeatIds: asStringArray(session.selectedSeatIds),
    startedAt: session.startedAt.toISOString(),
    saleOpenedAt: saleOpenedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    bookingDeadlineMs: session.scenarioVersion.bookingDeadlineMs!,
  });
}

function eventLabel(eventType: string, stage: string) {
  const labels: Record<string, string> = {
    SESSION_CREATED: "Practice session created",
    SALE_OPEN: "The sale opened",
    SELECT_CATEGORY: "Ticket category selected",
    SELECT_QUANTITY: "Ticket quantity selected",
    SELECT_SEATS: "Seats selected",
    COMPLETE_VERIFICATION: "Mock verification completed",
    BOOKING_SUBMITTED: "Booking submitted",
    SESSION_TERMINATED: "Booking window ended",
  };
  return labels[eventType] ?? stage.replaceAll("_", " ").toLowerCase();
}

function timelineFrom(session: SessionWithRelations, buyers: BuyerTimelineEvent[] = [], terminal?: { type: string; label: string; elapsedMs: number; outcome: string }, recordedEvents = session.events) {
  const stageEvents = recordedEvents.map((event) => ({
    type: event.eventType,
    label: eventLabel(event.eventType, event.stage),
    simulatedTimeMs: Math.max(0, event.simulatedTimeMs),
    sequenceNumber: event.sequenceNumber,
    priority: event.eventPriority,
    outcome: "RECORDED",
  }));
  const buyerEvents = buyers.map((event) => ({
    type: event.type,
    label: `Virtual buyer requested ${event.quantity} ${session.scenarioVersion.scenario.slug === "stadium-opening" ? "seat(s)" : "ticket(s)"}`,
    simulatedTimeMs: event.simulatedTimeMs,
    sequenceNumber: event.sequenceNumber,
    priority: event.priority,
    outcome: event.result,
  }));
  const finalEvents = terminal ? [{
    type: terminal.type,
    label: terminal.label,
    simulatedTimeMs: Math.max(0, terminal.elapsedMs),
    sequenceNumber: 0,
    priority: terminal.type === "USER_ALLOCATION" ? 2 : 1,
    outcome: terminal.outcome,
  }] : [];
  return [...stageEvents, ...buyerEvents, ...finalEvents].sort((a, b) => a.simulatedTimeMs - b.simulatedTimeMs || a.priority - b.priority || a.sequenceNumber - b.sequenceNumber);
}

async function lockSession(tx: Tx, sessionId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "practice_sessions" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new ApiError(404, "SESSION_NOT_FOUND", "The booking session was not found.");
}

async function findSession(tx: Tx, sessionId: string, userId: string) {
  const session = await tx.practiceSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "The booking session was not found.");
  if (session.userId !== userId) throw new ApiError(403, "SESSION_FORBIDDEN", "This booking session belongs to another account.");
  return session;
}

async function appendSessionEvent(
  tx: Tx,
  sessionId: string,
  data: { type: string; stage: SessionWithRelations["stage"]; elapsedMs: number; payload: unknown; clientEventId?: string; priority?: number },
) {
  const sequenceNumber = await tx.sessionEvent.count({ where: { sessionId } }) + 1;
  return tx.sessionEvent.create({
    data: {
      sessionId,
      ...(data.clientEventId ? { clientEventId: data.clientEventId } : {}),
      sequenceNumber,
      eventType: data.type,
      stage: data.stage,
      simulatedTimeMs: Math.max(0, Math.floor(data.elapsedMs)),
      eventPriority: data.priority ?? 1,
      payload: JSON.parse(canonicalJson(data.payload)) as Prisma.InputJsonValue,
    },
  });
}

function sessionTimes(session: SessionWithRelations, now: Date) {
  const saleOpenedAt = session.saleOpenedAt ?? new Date(session.startedAt.getTime());
  const elapsedMs = Math.max(0, now.getTime() - saleOpenedAt.getTime());
  const sessionLifetimeMs = Math.max(0, session.expiresAt.getTime() - saleOpenedAt.getTime());
  return { saleOpenedAt, elapsedMs, sessionLifetimeMs };
}

function selectTimeout(session: SessionWithRelations, config: BookingScenarioConfig, elapsedMs: number, sessionLifetimeMs: number) {
  const deadline = session.scenarioVersion.bookingDeadlineMs!;
  if (elapsedMs >= deadline && deadline <= sessionLifetimeMs) return { outcome: "SOLD_OUT" as const, failureReason: "DEADLINE_MISSED" as const };
  if (elapsedMs >= sessionLifetimeMs) return { outcome: "EXPIRED" as const, failureReason: "SESSION_EXPIRED" as const };
  return null;
}

async function persistTerminal(
  tx: Tx,
  session: SessionWithRelations,
  now: Date,
  details: {
    outcome: "CONFIRMED" | "SOLD_OUT" | "EXPIRED";
    failureReason: "DEADLINE_MISSED" | "INVENTORY_EXHAUSTED" | "SESSION_EXPIRED" | null;
    allocatedQuantity: number;
    inventoryRemaining: number | null;
    inventoryExhaustedAtMs?: number | null;
    buyers?: BuyerTimelineEvent[];
    userEvent?: { type: string; outcome: string; label: string };
  },
) {
  if (session.attempt) return { attempt: toAttemptResponse(session.attempt), created: false };
  const config = validateVersion(session.scenarioVersion);
  const { saleOpenedAt, elapsedMs } = sessionTimes(session, now);
  const timeoutType = details.outcome === "EXPIRED" ? "SESSION_EXPIRED" : "DEADLINE_REACHED";
  const terminalElapsedMs = details.inventoryExhaustedAtMs ?? elapsedMs;
  const terminalEvent = details.userEvent
    ? { type: details.userEvent.type, label: details.userEvent.label, elapsedMs, outcome: details.userEvent.outcome }
    : { type: timeoutType, label: details.failureReason === "INVENTORY_EXHAUSTED" ? "The virtual inventory ran out" : details.outcome === "EXPIRED" ? "The session expired" : "The booking deadline passed", elapsedMs: terminalElapsedMs, outcome: details.outcome };
  const recordedEvents = await tx.sessionEvent.findMany({ where: { sessionId: session.id }, orderBy: { sequenceNumber: "asc" } });
  const timeline = timelineFrom(session, details.buyers, terminalEvent, recordedEvents);
  if (details.outcome === "SOLD_OUT") {
    const message = config.soldOutMessages[randomInt(config.soldOutMessages.length)]!;
    timeline.push({ type: "OUTCOME_MESSAGE", label: message, simulatedTimeMs: terminalEvent.elapsedMs, sequenceNumber: 0, priority: 3, outcome: details.failureReason ?? "SOLD_OUT" });
    timeline.sort((a, b) => a.simulatedTimeMs - b.simulatedTimeMs || a.priority - b.priority || a.sequenceNumber - b.sequenceNumber);
  }
  const attempt = await tx.attempt.create({
    data: {
      sessionId: session.id,
      userId: session.userId,
      scenarioVersionId: session.scenarioVersionId,
      status: "VALID",
      outcome: details.outcome,
      completionMs: elapsedMs,
      accuracyBps: 0,
      errorCount: 0,
      score: 0,
      scoringVersion: session.scenarioVersion.scoringVersion,
      startedAt: saleOpenedAt,
      completedAt: now,
      failureReason: details.failureReason,
      requestedQuantity: session.requestedQuantity,
      allocatedQuantity: details.allocatedQuantity,
      inventoryRemainingAtOutcome: details.inventoryRemaining,
      inventoryExhaustedAtMs: details.inventoryExhaustedAtMs ?? null,
      resultTimeline: JSON.parse(canonicalJson(timeline)) as Prisma.InputJsonValue,
    },
  });
  if (attempt.outcome === "CONFIRMED" && attempt.status === "VALID" && attempt.completionMs !== null) {
    await tx.$executeRaw`
      INSERT INTO "personal_bests" ("userId", "scenarioVersionId", "attemptId", "completionMs", "achievedAt")
      VALUES (${attempt.userId}::uuid, ${attempt.scenarioVersionId}::uuid, ${attempt.id}::uuid, ${attempt.completionMs}, ${now})
      ON CONFLICT ("userId", "scenarioVersionId") DO UPDATE
      SET "attemptId" = EXCLUDED."attemptId", "completionMs" = EXCLUDED."completionMs", "achievedAt" = EXCLUDED."achievedAt"
      WHERE "personal_bests"."completionMs" > EXCLUDED."completionMs"
    `;
  }
  await tx.sessionEvent.updateMany({ where: { sessionId: session.id, attemptId: null }, data: { attemptId: attempt.id } });
  await tx.practiceSession.update({
    where: { id: session.id },
    data: {
      status: details.outcome === "EXPIRED" ? "EXPIRED" : "FINALIZED",
      terminalAt: now,
      terminalOutcome: details.outcome,
      completedAt: now,
    },
  });
  return { attempt: toAttemptResponse({ ...attempt }), created: true };
}

function evaluateDrop(session: SessionWithRelations, config: BookingScenarioConfig, elapsedMs: number, sessionLifetimeMs: number, userPurchase: { categoryId: string; quantity: number } | null): DropResult | null {
  if (config.type !== "COMPETITIVE_DROP") return null;
  return simulateCompetitiveDrop(config, session.seed, {
    elapsedMs,
    bookingDeadlineMs: session.scenarioVersion.bookingDeadlineMs!,
    sessionLifetimeMs,
  }, userPurchase);
}

async function terminalForCurrentTime(tx: Tx, session: SessionWithRelations, config: BookingScenarioConfig, now: Date) {
  if (session.saleOpenedAt && now < session.saleOpenedAt) return null;
  const { elapsedMs, sessionLifetimeMs } = sessionTimes(session, now);
  if (config.type === "COMPETITIVE_DROP") {
    const result = evaluateDrop(session, config, elapsedMs, sessionLifetimeMs, null)!;
    if (result.outcome === "CONFIRMED") return null;
    await appendSessionEvent(tx, session.id, { type: "SESSION_TERMINATED", stage: session.stage, elapsedMs: result.failureReason === "INVENTORY_EXHAUSTED" && result.inventoryExhaustedAtMs !== null ? result.inventoryExhaustedAtMs : elapsedMs, payload: { outcome: result.outcome, failureReason: result.failureReason } });
    return persistTerminal(tx, session, now, {
      outcome: result.outcome,
      failureReason: result.failureReason,
      allocatedQuantity: 0,
      inventoryRemaining: result.inventoryRemaining,
      inventoryExhaustedAtMs: result.inventoryExhaustedAtMs,
      buyers: result.timeline,
    });
  }
  const timeout = selectTimeout(session, config, elapsedMs, sessionLifetimeMs);
  if (!timeout) return null;
  await appendSessionEvent(tx, session.id, { type: "SESSION_TERMINATED", stage: session.stage, elapsedMs, payload: timeout });
  return persistTerminal(tx, session, now, { ...timeout, allocatedQuantity: 0, inventoryRemaining: null });
}

async function ensureSaleOpen(tx: Tx, session: SessionWithRelations, now: Date) {
  if (session.stage !== "WAITING_ROOM" || !session.saleOpenedAt || now < session.saleOpenedAt) return session;
  await tx.practiceSession.update({ where: { id: session.id }, data: { stage: "SALE_OPEN" } });
  const elapsedMs = now.getTime() - session.saleOpenedAt.getTime();
  await appendSessionEvent(tx, session.id, { type: "SALE_OPEN", stage: "SALE_OPEN", elapsedMs, payload: { openedBy: "SERVER" } });
  return (await tx.practiceSession.findUnique({ where: { id: session.id }, include: sessionInclude }))!;
}

export async function listBookingScenarios(prisma: PrismaClient) {
  const versions = await prisma.scenarioVersion.findMany({
    where: { bookingDeadlineMs: { not: null }, scenario: { mode: "BOOKING", isActive: true } },
    include: { scenario: true },
    orderBy: [{ scenarioId: "asc" }, { version: "desc" }],
  });
  const latestVersionByScenario = new Set<string>();
  return versions.filter((version) => {
    if (latestVersionByScenario.has(version.scenarioId)) return false;
    latestVersionByScenario.add(version.scenarioId);
    return true;
  }).map((version) => {
    const config = validateVersion(version);
    return {
      id: version.id,
      scenarioId: version.scenarioId,
      slug: version.scenario.slug,
      title: version.scenario.title,
      mode: version.scenario.mode,
      version: version.version,
      difficulty: version.difficulty,
      bookingDeadlineMs: version.bookingDeadlineMs!,
      durationLimitMs: version.durationLimitMs,
      config: publicConfig(config),
    };
  });
}

export async function createBookingSession(prisma: PrismaClient, userId: string, scenarioVersionId: string) {
  const version = await prisma.scenarioVersion.findUnique({ where: { id: scenarioVersionId }, include: { scenario: true } });
  if (!version || !version.bookingDeadlineMs || version.scenario.mode !== "BOOKING" || !version.scenario.isActive) throw new ApiError(404, "SCENARIO_NOT_FOUND", "This booking scenario is not available.");
  const config = validateVersion(version);
  if (version.durationLimitMs <= config.waitingRoomMs || version.durationLimitMs <= 0) throw new ApiError(500, "SCENARIO_CONFIGURATION_INVALID", "This scenario is not available right now.");
  const now = new Date();
  const saleOpenedAt = new Date(now.getTime() + config.waitingRoomMs);
  const stage = config.waitingRoomMs === 0 ? "SALE_OPEN" : "WAITING_ROOM";
  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.practiceSession.create({
      data: {
        userId,
        scenarioVersionId,
        seed: randomBytes(16).toString("hex"),
        startedAt: now,
        saleOpenedAt,
        expiresAt: new Date(now.getTime() + version.durationLimitMs),
        stage,
      },
    });
    await appendSessionEvent(tx, session.id, { type: stage === "SALE_OPEN" ? "SALE_OPEN" : "SESSION_CREATED", stage, elapsedMs: 0, payload: { source: "SERVER" } });
    return tx.practiceSession.findUnique({ where: { id: session.id }, include: sessionInclude });
  });
  return toSessionResponse(created!);
}

export async function getBookingSession(prisma: PrismaClient, sessionId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    let session = await findSession(tx, sessionId, userId);
    if (session.attempt) return { session: toSessionResponse(session), attempt: toAttemptResponse(session.attempt) };
    const now = new Date();
    session = await ensureSaleOpen(tx, session, now);
    const config = validateVersion(session.scenarioVersion);
    const terminal = await terminalForCurrentTime(tx, session, config, now);
    if (terminal) {
      session = (await tx.practiceSession.findUnique({ where: { id: session.id }, include: sessionInclude }))!;
      return { session: toSessionResponse(session), attempt: terminal.attempt };
    }
    return { session: toSessionResponse(session), attempt: null };
  });
}

export async function recordBookingAction(prisma: PrismaClient, sessionId: string, userId: string, action: BookingAction) {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    let session = await findSession(tx, sessionId, userId);
    if (session.attempt) return { session: toSessionResponse(session), attempt: toAttemptResponse(session.attempt), replayed: true };
    const prior = await tx.sessionEvent.findUnique({ where: { clientEventId: action.clientEventId } });
    if (prior) {
      if (prior.sessionId !== sessionId || prior.eventType !== action.type || session.attempt) throw new ApiError(409, "EVENT_REPLAY_CONFLICT", "This booking action was already used.");
      return { session: toSessionResponse(session), attempt: null, replayed: true };
    }
    if (session.status !== "ACTIVE" || session.terminalOutcome) throw new ApiError(409, "SESSION_TERMINAL", "This booking session has already ended.");
    const now = new Date();
    session = await ensureSaleOpen(tx, session, now);
    const config = validateVersion(session.scenarioVersion);
    const terminal = await terminalForCurrentTime(tx, session, config, now);
    if (terminal) {
      session = (await tx.practiceSession.findUnique({ where: { id: session.id }, include: sessionInclude }))!;
      return { session: toSessionResponse(session), attempt: terminal.attempt, replayed: false };
    }
    if (!session.saleOpenedAt || now < session.saleOpenedAt) throw new ApiError(409, "SALE_NOT_OPEN", "The waiting room is still open.");
    const progress = {
      stage: session.stage,
      selectedCategoryId: session.selectedCategoryId,
      requestedQuantity: session.requestedQuantity,
      selectedSeatIds: asStringArray(session.selectedSeatIds),
    };
    let next;
    try {
      next = advanceBooking(progress, action, config);
    } catch (error) {
      if (error instanceof BookingTransitionError) throw new ApiError(409, error.code, error.message);
      throw error;
    }
    await tx.practiceSession.update({
      where: { id: sessionId },
      data: {
        stage: next.stage,
        selectedCategoryId: next.selectedCategoryId,
        requestedQuantity: next.requestedQuantity,
        ...(next.selectedSeatIds ? { selectedSeatIds: next.selectedSeatIds as Prisma.InputJsonValue } : {}),
      },
    });
    const { elapsedMs } = sessionTimes(session, now);
    await appendSessionEvent(tx, sessionId, { type: action.type, stage: next.stage, elapsedMs, clientEventId: action.clientEventId, payload: action });
    const updated = await tx.practiceSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    return { session: toSessionResponse(updated!), attempt: null, replayed: false };
  });
}

export async function submitBooking(prisma: PrismaClient, sessionId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    let session = await findSession(tx, sessionId, userId);
    if (session.attempt) return { attempt: toAttemptResponse(session.attempt), created: false };
    if (session.status !== "ACTIVE" || session.terminalOutcome) throw new ApiError(409, "SESSION_TERMINAL", "This booking session has already ended.");
    const now = new Date();
    session = await ensureSaleOpen(tx, session, now);
    const config = validateVersion(session.scenarioVersion);
    const timeout = await terminalForCurrentTime(tx, session, config, now);
    if (timeout) return timeout;
    if (!session.saleOpenedAt || now < session.saleOpenedAt) throw new ApiError(409, "SALE_NOT_OPEN", "The waiting room is still open.");
    if (session.stage !== "REVIEW" || !session.selectedCategoryId || !session.requestedQuantity) throw new ApiError(422, "BOOKING_INCOMPLETE", "Complete each booking stage before submitting.");
    const { elapsedMs, sessionLifetimeMs } = sessionTimes(session, now);
    if (config.type === "STANDARD") {
      const event = await appendSessionEvent(tx, sessionId, { type: "BOOKING_SUBMITTED", stage: session.stage, elapsedMs, payload: { source: "SERVER" }, priority: 2 });
      void event;
      return persistTerminal(tx, session, now, {
        outcome: "CONFIRMED",
        failureReason: null,
        allocatedQuantity: session.requestedQuantity,
        inventoryRemaining: null,
        userEvent: { type: "USER_ALLOCATION", outcome: "ALLOCATED", label: `Your ${session.requestedQuantity} ticket(s) were confirmed` },
      });
    }
    const result = evaluateDrop(session, config, elapsedMs, sessionLifetimeMs, { categoryId: session.selectedCategoryId, quantity: session.requestedQuantity })!;
    await appendSessionEvent(tx, sessionId, { type: "BOOKING_SUBMITTED", stage: session.stage, elapsedMs, payload: { source: "SERVER" }, priority: 2 });
    const final = await persistTerminal(tx, session, now, {
      outcome: result.outcome,
      failureReason: result.failureReason,
      allocatedQuantity: result.allocatedQuantity,
      inventoryRemaining: result.inventoryRemaining,
      inventoryExhaustedAtMs: result.inventoryExhaustedAtMs,
      buyers: result.timeline,
      userEvent: { type: "USER_ALLOCATION", outcome: result.outcome === "CONFIRMED" ? "ALLOCATED" : "INSUFFICIENT_INVENTORY", label: result.outcome === "CONFIRMED" ? `Your ${result.allocatedQuantity} ticket(s) were confirmed` : "Your requested inventory was unavailable" },
    });
    return final;
  }, { timeout: 15_000 });
}

export async function getPersonalBest(prisma: PrismaClient, userId: string, scenarioSlug: string) {
  const version = await prisma.scenarioVersion.findFirst({
    where: { scenario: { slug: scenarioSlug, mode: "BOOKING", isActive: true }, bookingDeadlineMs: { not: null } },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!version) throw new ApiError(404, "SCENARIO_NOT_FOUND", "This booking scenario is not available.");
  const best = await prisma.personalBest.findUnique({
    where: { userId_scenarioVersionId: { userId, scenarioVersionId: version.id } },
  });
  return { personalBest: best ? { attemptId: best.attemptId, completionMs: best.completionMs, achievedAt: best.achievedAt.toISOString() } : null };
}

export async function getAttempt(prisma: PrismaClient, attemptId: string, userId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { session: { include: { scenarioVersion: { include: { scenario: true } } } } },
  });
  if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "The attempt was not found.");
  if (attempt.userId !== userId) throw new ApiError(403, "ATTEMPT_FORBIDDEN", "This attempt belongs to another account.");
  const config = validateVersion(attempt.session.scenarioVersion);
  const selectedCategory = config.categories.find((category) => category.id === attempt.session.selectedCategoryId);
  const best = await prisma.personalBest.findUnique({
    where: { userId_scenarioVersionId: { userId, scenarioVersionId: attempt.scenarioVersionId } },
  });
  const personalBest = best ? { attemptId: best.attemptId, completionMs: best.completionMs, achievedAt: best.achievedAt.toISOString() } : null;
  return attemptDetailResponseSchema.parse({
    personalBest,
    isPersonalBest: personalBest?.attemptId === attempt.id,
    ...toAttemptResponse(attempt),
    scenario: { slug: attempt.session.scenarioVersion.scenario.slug, title: attempt.session.scenarioVersion.scenario.title, version: attempt.session.scenarioVersion.version },
    bookingDeadlineMs: attempt.session.scenarioVersion.bookingDeadlineMs,
    selection: {
      categoryId: attempt.session.selectedCategoryId,
      categoryLabel: selectedCategory?.label ?? null,
      seatIds: asStringArray(attempt.session.selectedSeatIds),
      quantity: attempt.session.requestedQuantity,
      unitPriceCents: selectedCategory?.priceCents ?? null,
    },
  });
}

export function getPublicScenarioConfig(config: unknown) {
  const parsed = bookingScenarioConfigSchema.parse(config);
  return publicConfig(parsed);
}
