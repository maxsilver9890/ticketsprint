ALTER TABLE "attempts"
  DROP CONSTRAINT "attempts_allocated_quantity_range_check";

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_allocated_quantity_range_check"
    CHECK (
      "allocatedQuantity" IS NULL
      OR (
        "allocatedQuantity" >= 0
        AND (
          ("requestedQuantity" IS NULL AND "allocatedQuantity" = 0)
          OR ("requestedQuantity" IS NOT NULL AND "allocatedQuantity" <= "requestedQuantity")
        )
      )
    );
