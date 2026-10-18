import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { getQueueApiEnv } from "@ticketsprint/config/env";
import { errorHandler, notFound, requestId } from "./errors.js";
import { createQueueRushRouter } from "./queue-rush/queue-rush.routes.js";
import { QueueRushService } from "./queue-rush/queue-rush.service.js";

export function createQueueRushApp(service = new QueueRushService()) {
  const env = getQueueApiEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: false,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api/v1",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/v1/health/live", (_req, res) =>
    res.json({ status: "ok", service: "ticketsprint-api" }),
  );
  app.get("/api/v1/health/ready", (_req, res) =>
    res.json({
      status: "ok",
      service: "ticketsprint-api",
      state: "process-memory",
    }),
  );
  app.use("/api/v1", createQueueRushRouter(service));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
