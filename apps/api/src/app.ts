import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createRateLimitStore } from "./rate-limit-store.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { RedisConnection } from "./redis.types.js";
import { getApiEnv } from "@ticketsprint/config/env";
import { createAuthRouter } from "./auth.routes.js";
import { errorHandler, notFound, requestId } from "./errors.js";

export function createApp(prisma: PrismaClient, redis: RedisConnection) {
  const env = getApiEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    "/api/v1",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      store: createRateLimitStore(redis, "rl:api:"),
    }),
  );

  app.get("/api/v1/health/live", (_req, res) =>
    res.json({ status: "ok", service: "ticketsprint-api" }),
  );
  app.get("/api/v1/health/ready", async (_req, res) => {
    const [database, cache] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    const checks = {
      database: database.status === "fulfilled" ? "ok" : "error",
      redis: cache.status === "fulfilled" ? "ok" : "error",
    };
    const ready = checks.database === "ok" && checks.redis === "ok";
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "degraded",
      service: "ticketsprint-api",
      checks,
    });
  });

  app.use("/api/v1/auth", createAuthRouter(prisma, redis));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
