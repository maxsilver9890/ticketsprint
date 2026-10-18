import { MemoryStore } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { sendRedisCommand, type RedisConnection } from "./redis.types.js";
import { getApiEnv } from "@ticketsprint/config/env";
export function createRateLimitStore(redis: RedisConnection, prefix: string) {
  if (getApiEnv().NODE_ENV === "test") return new MemoryStore();
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => sendRedisCommand(redis, ...args),
  });
}
