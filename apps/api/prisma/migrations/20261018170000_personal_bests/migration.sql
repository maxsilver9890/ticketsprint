CREATE UNIQUE INDEX "attempts_id_userId_scenarioVersionId_key" ON "attempts"("id", "userId", "scenarioVersionId");

CREATE TABLE "personal_bests" (
    "userId" UUID NOT NULL,
    "scenarioVersionId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "completionMs" INTEGER NOT NULL,
    "achievedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_bests_pkey" PRIMARY KEY ("userId", "scenarioVersionId"),
    CONSTRAINT "personal_bests_completion_ms_check" CHECK ("completionMs" >= 0),
    CONSTRAINT "personal_bests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "personal_bests_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "personal_bests_attemptId_userId_scenarioVersionId_fkey"
        FOREIGN KEY ("attemptId", "userId", "scenarioVersionId")
        REFERENCES "attempts"("id", "userId", "scenarioVersionId")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "personal_bests_attemptId_key" ON "personal_bests"("attemptId");
CREATE UNIQUE INDEX "personal_bests_attemptId_userId_scenarioVersionId_key" ON "personal_bests"("attemptId", "userId", "scenarioVersionId");
CREATE INDEX "personal_bests_scenarioVersionId_completionMs_idx" ON "personal_bests"("scenarioVersionId", "completionMs");
