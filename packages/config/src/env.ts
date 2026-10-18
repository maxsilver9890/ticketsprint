import { z } from "zod";

const queueApiSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
});

export type QueueApiEnv = z.infer<typeof queueApiSchema>;

export function getQueueApiEnv(source: NodeJS.ProcessEnv = process.env) {
  return queueApiSchema.parse(source);
}

export function resolveQueueApiPort(env: Pick<QueueApiEnv, "PORT" | "API_PORT">) {
  return env.PORT ?? env.API_PORT;
}
