import { Router } from "express";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { RedisConnection } from "./redis.types.js";
import { rateLimit } from "express-rate-limit";
import { createRateLimitStore } from "./rate-limit-store.js";
import argon2 from "argon2";
import {
  loginRequestSchema,
  registerRequestSchema,
  userResponseSchema,
} from "@ticketsprint/contracts";
import {
  authenticate,
  clearAccessCookie,
  issueCsrf,
  requireCsrf,
  setAccessCookie,
} from "./auth.js";
export function createAuthRouter(prisma: PrismaClient, redis: RedisConnection) {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 900000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store: createRateLimitStore(redis, "rl:auth:"),
  });
  r.get("/csrf", (_req, res) => res.json({ csrfToken: issueCsrf(res) }));
  r.post("/register", limiter, requireCsrf, async (req, res, next) => {
    try {
      const input = registerRequestSchema.parse(req.body);
      const hash = await argon2.hash(input.password, { type: argon2.argon2id });
      const user = await prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          passwordHash: hash,
        },
        select: { id: true, username: true, email: true, createdAt: true },
      });
      await setAccessCookie(res, user.id, user.username);
      res.status(201).json({
        user: userResponseSchema.parse({
          ...user,
          createdAt: user.createdAt.toISOString(),
        }),
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        res.status(409).json({
          error: {
            code: "ACCOUNT_EXISTS",
            message: "An account with those details already exists.",
            requestId: res.locals.requestId,
          },
        });
        return;
      }
      next(error);
    }
  });
  r.post("/login", limiter, requireCsrf, async (req, res, next) => {
    try {
      const input = loginRequestSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email: input.email },
      });
      const valid = user
        ? await argon2.verify(user.passwordHash, input.password)
        : false;
      if (!user || !valid) {
        res.status(401).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect.",
            requestId: res.locals.requestId,
          },
        });
        return;
      }
      await setAccessCookie(res, user.id, user.username);
      res.json({
        user: userResponseSchema.parse({
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        }),
      });
    } catch (error) {
      next(error);
    }
  });
  r.post("/logout", requireCsrf, (_req, res) => {
    clearAccessCookie(res);
    res.status(204).end();
  });
  r.get("/me", authenticate, async (_req, res, next) => {
    try {
      const identity = res.locals.user as { id: string };
      const user = await prisma.user.findUnique({
        where: { id: identity.id },
        select: { id: true, username: true, email: true, createdAt: true },
      });
      if (!user) {
        res.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication is required.",
            requestId: res.locals.requestId,
          },
        });
        return;
      }
      res.json({
        user: userResponseSchema.parse({
          ...user,
          createdAt: user.createdAt.toISOString(),
        }),
      });
    } catch (error) {
      next(error);
    }
  });
  return r;
}
