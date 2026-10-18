export type PublicScenario = {
  id: string;
  scenarioId: string;
  slug: string;
  title: string;
  mode: "BOOKING";
  version: number;
  difficulty: string;
  bookingDeadlineMs: number;
  durationLimitMs: number;
  config: {
    type: "STANDARD" | "COMPETITIVE_DROP";
    waitingRoomMs: number;
    requiresSeatSelection: boolean;
    requiresVerification: boolean;
    maxQuantity: number;
    categories: Array<{ id: string; label: string; priceCents: number; inventory: number; maxQuantity: number; seatIds?: string[] }>;
    soldOutMessages: string[];
  };
};
