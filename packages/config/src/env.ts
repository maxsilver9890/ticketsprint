import { z } from "zod";
const apiSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z
    .url()
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    ),
  REDIS_URL: z
    .url()
    .refine((v) => v.startsWith("redis://") || v.startsWith("rediss://")),
  JWT_SECRET: z.string().min(32),
});
const webSchema = z.object({ NEXT_PUBLIC_API_URL: z.url() });
export type ApiEnv = z.infer<typeof apiSchema>;
export function getApiEnv(source: NodeJS.ProcessEnv = process.env) {
  return apiSchema.parse(source);
}
export function getWebEnv(source: NodeJS.ProcessEnv = process.env) {
  return webSchema.parse(source);
}
export function validateApiEnv(source: NodeJS.ProcessEnv = process.env) {
  return apiSchema.safeParse(source);
}

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
