import { createClient } from "redis";
import { getApiEnv } from "@ticketsprint/config/env";
export const redis = createClient({ url: getApiEnv().REDIS_URL });
redis.on("error", (error) =>
  console.error(
    JSON.stringify({
      level: "error",
      message: "Redis client error",
      errorType: error.name,
    }),
  ),
);
