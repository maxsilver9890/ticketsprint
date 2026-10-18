import { z } from "zod";

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const liveHealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("ticketsprint-api"),
});
