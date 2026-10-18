-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ScenarioMode" AS ENUM ('BOOKING', 'REFLEX');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'FINALIZED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TerminalOutcome" AS ENUM ('CONFIRMED', 'SOLD_OUT', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('VALID', 'FLAGGED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(24) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "mode" "ScenarioMode" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_versions" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "difficulty" VARCHAR(32) NOT NULL,
    "config" JSONB NOT NULL,
    "configHash" VARCHAR(64) NOT NULL,
    "scoringVersion" VARCHAR(32) NOT NULL,
    "durationLimitMs" INTEGER NOT NULL,
    "bookingDeadlineMs" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scenarioVersionId" UUID NOT NULL,
    "seed" VARCHAR(128) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleOpenedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "terminalAt" TIMESTAMPTZ(6),
    "terminalOutcome" "TerminalOutcome",
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scenarioVersionId" UUID NOT NULL,
    "status" "AttemptStatus" NOT NULL,
    "outcome" "TerminalOutcome" NOT NULL,
    "completionMs" INTEGER,
    "medianReactionMs" INTEGER,
    "accuracyBps" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoringVersion" VARCHAR(32) NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_events" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "scenarios_slug_key" ON "scenarios"("slug");

-- CreateIndex
CREATE INDEX "scenario_versions_scenarioId_createdAt_idx" ON "scenario_versions"("scenarioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_versions_scenarioId_version_key" ON "scenario_versions"("scenarioId", "version");

-- CreateIndex
CREATE INDEX "practice_sessions_userId_status_idx" ON "practice_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "practice_sessions_status_expiresAt_idx" ON "practice_sessions"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_sessionId_key" ON "attempts"("sessionId");

-- CreateIndex
CREATE INDEX "attempts_scenarioVersionId_status_completionMs_idx" ON "attempts"("scenarioVersionId", "status", "completionMs");

-- CreateIndex
CREATE INDEX "attempts_scenarioVersionId_status_score_idx" ON "attempts"("scenarioVersionId", "status", "score");

-- CreateIndex
CREATE INDEX "attempts_userId_createdAt_idx" ON "attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "attempt_events_attemptId_sequenceNumber_idx" ON "attempt_events"("attemptId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_events_attemptId_sequenceNumber_key" ON "attempt_events"("attemptId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scenario_versions"
  ADD CONSTRAINT "scenario_versions_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "scenario_versions_duration_positive_check" CHECK ("durationLimitMs" > 0),
  ADD CONSTRAINT "scenario_versions_booking_deadline_positive_check" CHECK ("bookingDeadlineMs" IS NULL OR "bookingDeadlineMs" > 0);

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_accuracy_bps_range_check" CHECK ("accuracyBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "attempts_score_range_check" CHECK ("score" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "attempts_error_count_nonnegative_check" CHECK ("errorCount" >= 0),
  ADD CONSTRAINT "attempts_completion_nonnegative_check" CHECK ("completionMs" IS NULL OR "completionMs" >= 0),
  ADD CONSTRAINT "attempts_reaction_nonnegative_check" CHECK ("medianReactionMs" IS NULL OR "medianReactionMs" >= 0);

ALTER TABLE "attempt_events"
  ADD CONSTRAINT "attempt_events_sequence_positive_check" CHECK ("sequenceNumber" > 0),
  ADD CONSTRAINT "attempt_events_elapsed_nonnegative_check" CHECK ("elapsedMs" >= 0);
