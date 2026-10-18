-- CreateEnum
CREATE TYPE "BookingStage" AS ENUM ('WAITING_ROOM', 'SALE_OPEN', 'CATEGORY_SELECTED', 'QUANTITY_SELECTED', 'SEATS_SELECTED', 'VERIFICATION', 'REVIEW');

-- CreateEnum
CREATE TYPE "BookingFailureReason" AS ENUM ('DEADLINE_MISSED', 'INVENTORY_EXHAUSTED', 'SESSION_EXPIRED');

-- DropForeignKey
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_sessionId_fkey";

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "allocatedQuantity" INTEGER,
ADD COLUMN     "failureReason" "BookingFailureReason",
ADD COLUMN     "inventoryRemainingAtOutcome" INTEGER,
ADD COLUMN     "requestedQuantity" INTEGER,
ADD COLUMN     "resultTimeline" JSONB;

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN     "requestedQuantity" INTEGER,
ADD COLUMN     "selectedCategoryId" VARCHAR(32),
ADD COLUMN     "selectedSeatIds" JSONB,
ADD COLUMN     "stage" "BookingStage" NOT NULL DEFAULT 'WAITING_ROOM';

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "attemptId" UUID,
    "clientEventId" UUID,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "stage" "BookingStage" NOT NULL,
    "simulatedTimeMs" INTEGER NOT NULL,
    "eventPriority" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_events_clientEventId_key" ON "session_events"("clientEventId");

-- CreateIndex
CREATE INDEX "session_events_sessionId_simulatedTimeMs_eventPriority_sequ_idx" ON "session_events"("sessionId", "simulatedTimeMs", "eventPriority", "sequenceNumber");

-- CreateIndex
CREATE INDEX "session_events_attemptId_sequenceNumber_idx" ON "session_events"("attemptId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "session_events_sessionId_sequenceNumber_key" ON "session_events"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_sessionId_userId_scenarioVersionId_key" ON "attempts"("sessionId", "userId", "scenarioVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_sessions_id_userId_scenarioVersionId_key" ON "practice_sessions"("id", "userId", "scenarioVersionId");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_userId_scenarioVersionId_fkey" FOREIGN KEY ("sessionId", "userId", "scenarioVersionId") REFERENCES "practice_sessions"("id", "userId", "scenarioVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_requested_quantity_positive_check"
    CHECK ("requestedQuantity" IS NULL OR "requestedQuantity" > 0);

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_requested_quantity_positive_check"
    CHECK ("requestedQuantity" IS NULL OR "requestedQuantity" > 0),
  ADD CONSTRAINT "attempts_allocated_quantity_range_check"
    CHECK ("allocatedQuantity" IS NULL OR ("allocatedQuantity" >= 0 AND "requestedQuantity" IS NOT NULL AND "allocatedQuantity" <= "requestedQuantity")),
  ADD CONSTRAINT "attempts_inventory_remaining_nonnegative_check"
    CHECK ("inventoryRemainingAtOutcome" IS NULL OR "inventoryRemainingAtOutcome" >= 0);

ALTER TABLE "session_events"
  ADD CONSTRAINT "session_events_sequence_positive_check" CHECK ("sequenceNumber" > 0),
  ADD CONSTRAINT "session_events_simulated_time_nonnegative_check" CHECK ("simulatedTimeMs" >= 0),
  ADD CONSTRAINT "session_events_priority_check" CHECK ("eventPriority" IN (0, 1, 2));

CREATE FUNCTION prevent_scenario_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Scenario versions are immutable; create a new version instead.' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scenario_versions_immutable
  BEFORE UPDATE OR DELETE ON "scenario_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_scenario_version_mutation();
