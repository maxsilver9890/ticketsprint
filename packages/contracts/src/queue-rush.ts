import { z } from "zod";

export const queueRushDifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export const queueRushStageSchema = z.enum([
  "QUEUING",
  "SEAT_SELECTION",
  "CHECKOUT",
  "WON",
  "LOST",
]);
export const queueRushSeatStateSchema = z.enum([
  "AVAILABLE",
  "HELD",
  "SOLD",
]);
export const queueRushSaleStatusSchema = z.enum(["ON_SALE", "SOLD_OUT"]);
export const queueRushFailureSchema = z.enum([
  "INVENTORY_EXHAUSTED",
  "TIME_LIMIT",
]);

export const queueRushDropSchema = z
  .object({
    slug: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    artist: z.string().min(1).max(120),
    date: z.string().min(1).max(120),
    doors: z.string().min(1).max(120),
    venue: z.string().min(1).max(120),
    location: z.string().min(1).max(120),
    format: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    theme: z.enum(["stadium", "festival", "night", "club"]),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();

export const createQueueRushGameSchema = z
  .object({
    dropSlug: z.string().min(1).max(80),
    difficulty: queueRushDifficultySchema,
  })
  .strict();
export const seatHoldRequestSchema = z
  .object({
    seatIds: z
      .array(z.string().regex(/^[A-Z]{1,3}-[A-H][0-9]{2}$/))
      .min(1)
      .max(4),
  })
  .strict()
  .refine(
    (value) => new Set(value.seatIds).size === value.seatIds.length,
    "Seat IDs must be unique.",
  );
export const emptyGameActionSchema = z.object({}).strict();

export const queueRushSeatSchema = z
  .object({
    id: z.string(),
    sectionId: z.string(),
    sectionName: z.string(),
    row: z.string(),
    number: z.number().int().positive(),
    state: queueRushSeatStateSchema,
  })
  .strict();

export const queueRushGameSchema = z
  .object({
    id: z.uuid(),
    drop: queueRushDropSchema,
    difficulty: queueRushDifficultySchema,
    stage: queueRushStageSchema,
    serverNowMs: z.number().int().nonnegative(),
    queue: z
      .object({
        position: z.number().int().nonnegative(),
        total: z.number().int().positive(),
        progressPercent: z.number().min(0).max(100),
        elapsedMs: z.number().int().nonnegative(),
        saleStatus: queueRushSaleStatusSchema,
        inventoryRemaining: z.number().int().nonnegative(),
      })
      .strict(),
    timing: z
      .object({
        deadlineAtMs: z.number().int().nonnegative().nullable(),
        holdExpiresAtMs: z.number().int().nonnegative().nullable(),
        queueMs: z.number().int().nonnegative().nullable(),
        selectionMs: z.number().int().nonnegative().nullable(),
        checkoutMs: z.number().int().nonnegative().nullable(),
        completionMs: z.number().int().nonnegative().nullable(),
        timeRemainingMs: z.number().int().nonnegative(),
        holdRemainingMs: z.number().int().nonnegative(),
      })
      .strict(),
    seats: z.array(queueRushSeatSchema),
    botClaims: z.number().int().nonnegative(),
    selectedSeatIds: z.array(z.string()),
    outcome: z.enum(["WON", "LOST"]).nullable(),
    failureReason: queueRushFailureSchema.nullable(),
    notice: z.string().nullable(),
    paymentOutcome: z.literal("APPROVED").nullable(),
  })
  .strict();

export type QueueRushDifficulty = z.infer<typeof queueRushDifficultySchema>;
export type QueueRushStage = z.infer<typeof queueRushStageSchema>;
export type QueueRushDrop = z.infer<typeof queueRushDropSchema>;
export type QueueRushGameView = z.infer<typeof queueRushGameSchema>;
