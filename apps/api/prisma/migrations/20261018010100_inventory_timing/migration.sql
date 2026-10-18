ALTER TABLE "attempts"
  ADD COLUMN "inventoryExhaustedAtMs" INTEGER;

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_inventory_exhausted_nonnegative_check"
    CHECK ("inventoryExhaustedAtMs" IS NULL OR "inventoryExhaustedAtMs" >= 0);
