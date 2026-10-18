import { Router } from "express";
import {
  createQueueRushGameSchema,
  emptyGameActionSchema,
  seatHoldRequestSchema,
  seatSelectionRequestSchema,
} from "@ticketsprint/contracts/queue-rush";
import { ApiError } from "../errors.js";
import { QueueRushRuleError } from "@ticketsprint/simulation-engine";
import { QueueRushService } from "./queue-rush.service.js";

function routeId(request: { params: Record<string, string | string[]> }) {
  const id = request.params.id;
  if (typeof id !== "string")
    throw new ApiError(400, "INVALID_GAME_ID", "A valid game ID is required.");
  return id;
}
function routeSlug(request: { params: Record<string, string | string[]> }) {
  const slug = request.params.slug;
  if (typeof slug !== "string")
    throw new ApiError(400, "INVALID_DROP", "A valid drop slug is required.");
  return slug;
}
function handleRuleError(error: unknown): never {
  if (error instanceof QueueRushRuleError)
    throw new ApiError(error.status, error.code, error.message);
  throw error;
}

export function createQueueRushRouter(service: QueueRushService) {
  const router = Router();
  router.get("/drops", (_req, res) => {
    res.json({ drops: service.listDrops() });
  });
  router.get("/drops/:slug", (req, res) => {
    const drop = service
      .listDrops()
      .find((candidate) => candidate.slug === routeSlug(req));
    if (!drop)
      throw new ApiError(
        404,
        "DROP_NOT_FOUND",
        "That practice drop is not available.",
      );
    res.json({ drop });
  });
  router.post("/games", (req, res, next) => {
    try {
      const input = createQueueRushGameSchema.parse(req.body);
      res.status(201).json({ game: service.create(input) });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  router.get("/games/:id", (req, res, next) => {
    try {
      res.json({ game: service.get(routeId(req)) });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  router.post("/games/:id/hold", (req, res, next) => {
    try {
      const input = seatHoldRequestSchema.parse(req.body);
      res.json({ game: service.hold(routeId(req), input.seatIds) });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  router.post("/games/:id/selection", (req, res, next) => {
    try {
      const input = seatSelectionRequestSchema.parse(req.body);
      res.json({ game: service.select(routeId(req), input.seatIds) });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  router.post("/games/:id/hold/release", (req, res, next) => {
    try {
      emptyGameActionSchema.parse(req.body);
      res.json({ game: service.abandon(routeId(req)) });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  router.post("/games/:id/pay", (req, res, next) => {
    try {
      emptyGameActionSchema.parse(req.body);
      const result = service.pay(routeId(req));
      res.status(result.duplicate ? 200 : 201).json({ game: result.game });
    } catch (error) {
      try {
        handleRuleError(error);
      } catch (handled) {
        next(handled);
      }
    }
  });
  return router;
}
