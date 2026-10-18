import { z } from "zod";
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/);
export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z.string().min(12).max(128);
export const registerRequestSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
export const loginRequestSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const userResponseSchema = z.object({
  id: z.uuid(),
  username: usernameSchema,
  email: emailSchema,
  createdAt: z.iso.datetime(),
});
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
export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("ticketsprint-api"),
  checks: z.object({
    database: z.enum(["ok", "error"]),
    redis: z.enum(["ok", "error"]),
  }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export {
  bookingActionSchema,
  bookingScenarioConfigSchema,
  bookingScenarioTypeSchema,
  createSessionRequestSchema,
  publicBookingConfigSchema,
  sessionResponseSchema,
  attemptResponseSchema,
  type BookingAction,
  type BookingScenarioConfig,
  type PublicBookingConfig,
} from "./booking.js";
