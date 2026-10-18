import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
      requestId: res.locals.requestId,
    },
  });
};
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  const id = res.locals.requestId as string;
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        requestId: id,
      },
    });
    return;
  }
  console.error(
    JSON.stringify({
      level: "error",
      requestId: id,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: id,
    },
  });
};
