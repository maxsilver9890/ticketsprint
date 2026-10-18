import { z } from "zod";

export const bookingScenarioTypeSchema = z.enum(["STANDARD", "COMPETITIVE_DROP"]);
const categorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  label: z.string().min(1).max(80),
  priceCents: z.number().int().min(0).max(100_000_000),
  inventory: z.number().int().min(1).max(100_000),
  maxQuantity: z.number().int().min(1).max(8),
  seatIds: z.array(z.string().min(1).max(16)).max(100_000).optional(),
}).strict();
const buyerProfileSchema = z.object({
  profile: z.enum(["FAST", "AVERAGE", "SLOW", "ERRATIC"]),
  count: z.number().int().min(0).max(10_000),
  arrivalMinMs: z.number().int().min(0).max(3_600_000),
  arrivalMaxMs: z.number().int().min(0).max(3_600_000),
  quantityMin: z.number().int().min(1).max(8),
  quantityMax: z.number().int().min(1).max(8),
}).strict().refine((profile) => profile.arrivalMinMs <= profile.arrivalMaxMs).refine((profile) => profile.quantityMin <= profile.quantityMax);
const common = {
  version: z.literal(1),
  bookingDeadlineMs: z.number().int().positive().max(3_600_000),
  waitingRoomMs: z.number().int().min(0).max(60_000),
  requiresSeatSelection: z.boolean(),
  requiresVerification: z.boolean(),
  maxQuantity: z.number().int().min(1).max(8),
  categories: z.array(categorySchema).min(1).max(32),
  soldOutMessages: z.array(z.string().min(1).max(180)).min(1).max(20),
};
function validateCategories(config: { type: "STANDARD" | "COMPETITIVE_DROP"; maxQuantity: number; requiresSeatSelection: boolean; categories: Array<z.infer<typeof categorySchema>>; virtualBuyerProfiles?: Array<z.infer<typeof buyerProfileSchema>> }, ctx: z.RefinementCtx) {
  const ids = new Set<string>();
  config.categories.forEach((category, index) => {
    if (ids.has(category.id)) ctx.addIssue({ code: "custom", path: ["categories", index, "id"], message: "Category IDs must be unique." });
    ids.add(category.id);
    if (category.maxQuantity > config.maxQuantity) ctx.addIssue({ code: "custom", path: ["categories", index, "maxQuantity"], message: "Category maximum cannot exceed the scenario maximum." });
    if (category.seatIds && category.seatIds.length !== category.inventory) ctx.addIssue({ code: "custom", path: ["categories", index, "seatIds"], message: "Seat list must match finite inventory." });
    if (category.seatIds && new Set(category.seatIds).size !== category.seatIds.length) ctx.addIssue({ code: "custom", path: ["categories", index, "seatIds"], message: "Seat IDs must be unique." });
  });
  if (config.requiresSeatSelection && config.categories.some((category) => !category.seatIds)) ctx.addIssue({ code: "custom", path: ["categories"], message: "Every category needs seat IDs when seat selection is required." });
  if (config.type === "COMPETITIVE_DROP" && config.requiresSeatSelection) ctx.addIssue({ code: "custom", path: ["requiresSeatSelection"], message: "Competitive drops do not offer individual seats in engine version 1." });
  if (config.type === "COMPETITIVE_DROP" && config.virtualBuyerProfiles?.some((profile) => profile.quantityMax > config.maxQuantity)) ctx.addIssue({ code: "custom", path: ["virtualBuyerProfiles"], message: "Buyer demand cannot exceed the scenario maximum." });
}

export const bookingScenarioConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("STANDARD"), ...common }).strict().superRefine(validateCategories),
  z.object({ type: z.literal("COMPETITIVE_DROP"), ...common, engineVersion: z.literal("competitive-drop-v1"), virtualBuyerProfiles: z.array(buyerProfileSchema).max(4), equalTimestampPriority: z.literal("BUYERS_BEFORE_USER") }).strict().superRefine(validateCategories),
]);
export const publicBookingConfigSchema = z.object({
  type: bookingScenarioTypeSchema,
  waitingRoomMs: z.number().int().nonnegative(),
  requiresSeatSelection: z.boolean(),
  requiresVerification: z.boolean(),
  maxQuantity: z.number().int().min(1).max(8),
  categories: z.array(categorySchema),
  soldOutMessages: z.array(z.string()),
}).strict();

export const createSessionRequestSchema = z.object({ scenarioVersionId: z.uuid() }).strict();
export const bookingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SELECT_CATEGORY"), categoryId: z.string().min(1).max(32), clientEventId: z.uuid() }).strict(),
  z.object({ type: z.literal("SELECT_QUANTITY"), quantity: z.number().int().min(1).max(8), clientEventId: z.uuid() }).strict(),
  z.object({ type: z.literal("SELECT_SEATS"), seatIds: z.array(z.string().min(1).max(16)).min(1).max(8), clientEventId: z.uuid() }).strict(),
  z.object({ type: z.literal("COMPLETE_VERIFICATION"), clientEventId: z.uuid() }).strict(),
]);
export type BookingAction = z.infer<typeof bookingActionSchema>;
export type BookingScenarioConfig = z.infer<typeof bookingScenarioConfigSchema>;
export type PublicBookingConfig = z.infer<typeof publicBookingConfigSchema>;

export const sessionResponseSchema = z.object({
  id: z.uuid(), status: z.enum(["ACTIVE", "FINALIZED", "EXPIRED"]),
  stage: z.enum(["WAITING_ROOM", "SALE_OPEN", "CATEGORY_SELECTED", "QUANTITY_SELECTED", "SEATS_SELECTED", "VERIFICATION", "REVIEW"]),
  terminalAttemptId: z.uuid().nullable(),
  scenario: z.object({ id: z.uuid(), slug: z.string(), title: z.string(), version: z.number().int(), config: publicBookingConfigSchema }),
  selectedCategoryId: z.string().nullable(), requestedQuantity: z.number().int().nullable(), selectedSeatIds: z.array(z.string()).nullable(),
  startedAt: z.iso.datetime(), saleOpenedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), bookingDeadlineMs: z.number().int().positive(),
});
export const timelineEventSchema = z.object({ type: z.string(), label: z.string(), simulatedTimeMs: z.number().int().nonnegative(), sequenceNumber: z.number().int().nonnegative(), priority: z.number().int(), outcome: z.string().optional() });
export const attemptResponseSchema = z.object({
  id: z.uuid(), sessionId: z.uuid(), outcome: z.enum(["CONFIRMED", "SOLD_OUT", "EXPIRED", "INVALIDATED"]),
  failureReason: z.enum(["DEADLINE_MISSED", "INVENTORY_EXHAUSTED", "SESSION_EXPIRED"]).nullable(),
  requestedQuantity: z.number().int().nullable(), allocatedQuantity: z.number().int().nullable(), inventoryRemainingAtOutcome: z.number().int().nullable(), inventoryExhaustedAtMs: z.number().int().nullable(),
  completionMs: z.number().int().nullable(), completedAt: z.iso.datetime().nullable(), timeline: z.array(timelineEventSchema),
});
export const personalBestSchema = z.object({
  attemptId: z.uuid(),
  completionMs: z.number().int().nonnegative(),
  achievedAt: z.iso.datetime(),
});
export const personalBestResponseSchema = z.object({ personalBest: personalBestSchema.nullable() });
export const attemptDetailResponseSchema = attemptResponseSchema.extend({
  personalBest: personalBestSchema.nullable(),
  isPersonalBest: z.boolean(),
  scenario: z.object({ slug: z.string(), title: z.string(), version: z.number().int() }),
  bookingDeadlineMs: z.number().int().positive(),
  selection: z.object({
    categoryId: z.string().nullable(),
    categoryLabel: z.string().nullable(),
    seatIds: z.array(z.string()).nullable(),
    quantity: z.number().int().nullable(),
    unitPriceCents: z.number().int().nonnegative().nullable(),
  }),
});
