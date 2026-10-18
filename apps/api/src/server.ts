import { getApiEnv } from "@ticketsprint/config/env";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { createApp } from "./app.js";
const env = getApiEnv();
async function start() {
  await prisma.$connect();
  await redis.connect();
  const server = createApp(prisma, redis).listen(env.API_PORT, "0.0.0.0", () =>
    console.log(
      JSON.stringify({
        level: "info",
        message: "API listening",
        port: env.API_PORT,
      }),
    ),
  );
  const shutdown = async () => {
    server.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
start().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      message: "API startup failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
