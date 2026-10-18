import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { bookingScenarioConfigSchema } from "@ticketsprint/contracts/booking";
import { canonicalJson } from "@ticketsprint/simulation-engine";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { getApiEnv } from "@ticketsprint/config/env";
const env = getApiEnv();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
try {
  await prisma.$connect();
  const messages = [
    "You ain't getting those tickets with this speed.",
    "Tickets sold out. The queue moved faster than you.",
    "That was a lovely attempt. Unfortunately, the tickets are gone.",
    "You hesitated. Someone else is already posting the concert story.",
    "Sold out. Better luck next drop.",
    "At this speed, even the waiting room is disappointed.",
  ];
  const scenarios = [
    {
      slug: "stadium-opening",
      title: "Stadium Opening Night",
      difficulty: "STARTER",
      durationLimitMs: 90_000,
      config: {
        type: "STANDARD", version: 1, bookingDeadlineMs: 60_000, waitingRoomMs: 0,
        requiresSeatSelection: true, requiresVerification: true, maxQuantity: 4,
        categories: [
          { id: "floor", label: "Floor", priceCents: 8_500, inventory: 8, maxQuantity: 4, seatIds: Array.from({ length: 8 }, (_, i) => `F-${String(i + 1).padStart(2, "0")}`) },
          { id: "balcony", label: "Balcony", priceCents: 5_500, inventory: 8, maxQuantity: 4, seatIds: Array.from({ length: 8 }, (_, i) => `B-${String(i + 1).padStart(2, "0")}`) },
        ],
        soldOutMessages: messages,
      },
    },
    {
      slug: "summer-festival-drop",
      title: "Summer Festival Drop",
      difficulty: "COMPETITIVE",
      durationLimitMs: 90_000,
      config: {
        type: "COMPETITIVE_DROP", version: 1, engineVersion: "competitive-drop-v1", equalTimestampPriority: "BUYERS_BEFORE_USER",
        bookingDeadlineMs: 60_000, waitingRoomMs: 0, requiresSeatSelection: false, requiresVerification: true, maxQuantity: 4,
        categories: [
          { id: "general", label: "General admission", priceCents: 7_500, inventory: 48, maxQuantity: 4 },
          { id: "premium", label: "Premium", priceCents: 12_500, inventory: 24, maxQuantity: 4 },
        ],
        virtualBuyerProfiles: [
          { profile: "FAST", count: 4, arrivalMinMs: 15_000, arrivalMaxMs: 22_000, quantityMin: 1, quantityMax: 2 },
          { profile: "AVERAGE", count: 8, arrivalMinMs: 22_001, arrivalMaxMs: 40_000, quantityMin: 1, quantityMax: 3 },
          { profile: "SLOW", count: 5, arrivalMinMs: 35_000, arrivalMaxMs: 55_000, quantityMin: 1, quantityMax: 2 },
          { profile: "ERRATIC", count: 3, arrivalMinMs: 0, arrivalMaxMs: 50_000, quantityMin: 1, quantityMax: 4 },
        ],
        soldOutMessages: messages,
      },
    },
    {
      slug: "last-ticket-rush",
      title: "Last Ticket Rush",
      difficulty: "EXPERT",
      durationLimitMs: 90_000,
      config: {
        type: "COMPETITIVE_DROP", version: 1, engineVersion: "competitive-drop-v1", equalTimestampPriority: "BUYERS_BEFORE_USER",
        bookingDeadlineMs: 60_000, waitingRoomMs: 0, requiresSeatSelection: false, requiresVerification: false, maxQuantity: 4,
        categories: [{ id: "last-seat", label: "Final ticket", priceCents: 15_000, inventory: 1, maxQuantity: 1 }],
        virtualBuyerProfiles: [{ profile: "FAST", count: 1, arrivalMinMs: 0, arrivalMaxMs: 0, quantityMin: 1, quantityMax: 1 }],
        soldOutMessages: messages,
      },
    },
    {
      slug: "small-club-drop",
      title: "Small Club Drop",
      difficulty: "PRECISION",
      durationLimitMs: 90_000,
      config: {
        type: "COMPETITIVE_DROP", version: 1, engineVersion: "competitive-drop-v1", equalTimestampPriority: "BUYERS_BEFORE_USER",
        bookingDeadlineMs: 60_000, waitingRoomMs: 0, requiresSeatSelection: false, requiresVerification: true, maxQuantity: 4,
        categories: [{ id: "club", label: "Club floor", priceCents: 6_000, inventory: 2, maxQuantity: 4 }],
        virtualBuyerProfiles: [],
        soldOutMessages: messages,
      },
    },
  ] as const;
  for (const definition of scenarios) {
    const config = bookingScenarioConfigSchema.parse(definition.config);
    const configHash = createHash("sha256").update(canonicalJson({ config, durationLimitMs: definition.durationLimitMs })).digest("hex");
    const scenario = await prisma.scenario.upsert({
      where: { slug: definition.slug },
      update: {},
      create: { slug: definition.slug, title: definition.title, mode: "BOOKING" },
    });
    const existing = await prisma.scenarioVersion.findUnique({
      where: { scenarioId_version: { scenarioId: scenario.id, version: 1 } },
    });
    if (existing) {
      if (existing.configHash !== configHash) throw new Error(`Scenario ${definition.slug} version 1 is immutable; add a new version instead.`);
      continue;
    }
    await prisma.scenarioVersion.create({
      data: {
        scenarioId: scenario.id,
        version: 1,
        difficulty: definition.difficulty,
        config: JSON.parse(canonicalJson(config)) as Prisma.InputJsonValue,
        configHash,
        scoringVersion: "booking-v1",
        durationLimitMs: definition.durationLimitMs,
        bookingDeadlineMs: config.bookingDeadlineMs,
      },
    });
  }
  console.log("Database ready; Phase 2 booking scenarios are seeded.");
} finally {
  await prisma.$disconnect();
}
