import dotenv from "dotenv";
import { getQueueApiEnv, resolveQueueApiPort } from "@ticketsprint/config/env";
import { createQueueRushApp } from "./queue-rush-app.js";
import { QueueRushService } from "./queue-rush/queue-rush.service.js";
dotenv.config({ path: "../../.env" });
const env = getQueueApiEnv();
const queueRushService = new QueueRushService(
  env.NODE_ENV === "test" ? { seed: () => "repeatable" } : {},
);
const port = resolveQueueApiPort(env);
const server = createQueueRushApp(queueRushService).listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Queue Rush API listening",
        port,
        state: "process-memory",
      }),
    );
  },
);
const shutdown = () => server.close();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
