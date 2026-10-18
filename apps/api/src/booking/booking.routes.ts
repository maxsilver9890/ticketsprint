import { Router } from "express";
import type { PrismaClient } from "../generated/prisma/client.js";
import { bookingActionSchema, createSessionRequestSchema } from "@ticketsprint/contracts/booking";
import { authenticate, requireCsrf } from "../auth.js";
import { ApiError } from "../errors.js";
import { createBookingSession, getAttempt, getBookingSession, getPersonalBest, listBookingScenarios, recordBookingAction, submitBooking } from "./booking.service.js";

function actorId(response: { locals: Record<string, unknown> }) {
  const user = response.locals.user as { id?: unknown } | undefined;
  if (typeof user?.id !== "string") throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user.id;
}

function routeId(request: { params: Record<string, string | string[]> }) {
  const id = request.params.id;
  if (typeof id !== "string") throw new ApiError(400, "INVALID_ID", "A valid resource ID is required.");
  return id;
}

export function createBookingRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/scenarios", async (_req, res) => {
    res.json({ scenarios: await listBookingScenarios(prisma) });
  });
  router.get("/scenarios/:id", async (req, res) => {
    const scenarios = await listBookingScenarios(prisma);
    const id = routeId(req);
    const versions = scenarios.filter((scenario) => scenario.scenarioId === id || scenario.slug === id || scenario.id === id);
    if (versions.length === 0) throw new ApiError(404, "SCENARIO_NOT_FOUND", "This booking scenario is not available.");
    res.json({ versions });
  });
  router.get("/scenarios/:id/personal-best", authenticate, async (req, res) => {
    res.json(await getPersonalBest(prisma, actorId(res), routeId(req)));
  });
  router.post("/sessions", authenticate, requireCsrf, async (req, res) => {
    const input = createSessionRequestSchema.parse(req.body);
    res.status(201).json({ session: await createBookingSession(prisma, actorId(res), input.scenarioVersionId) });
  });
  router.get("/sessions/:id", authenticate, async (req, res) => {
    res.json(await getBookingSession(prisma, routeId(req), actorId(res)));
  });
  router.post("/sessions/:id/events", authenticate, requireCsrf, async (req, res) => {
    const action = bookingActionSchema.parse(req.body);
    res.json(await recordBookingAction(prisma, routeId(req), actorId(res), action));
  });
  router.post("/sessions/:id/submit", authenticate, requireCsrf, async (req, res) => {
    if (req.body && Object.keys(req.body as object).length > 0) throw new ApiError(400, "INVALID_SUBMISSION", "Booking submission does not accept client result fields.");
    const result = await submitBooking(prisma, routeId(req), actorId(res));
    res.status(result.created ? 201 : 200).json({ attempt: result.attempt });
  });
  router.get("/attempts/:id", authenticate, async (req, res) => {
    res.json({ attempt: await getAttempt(prisma, routeId(req), actorId(res)) });
  });
  return router;
}
