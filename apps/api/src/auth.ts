import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getApiEnv } from "@ticketsprint/config/env";
const ACCESS = "ticketsprint_access",
  CSRF = "ticketsprint_csrf";
const env = () => getApiEnv();
const secret = () => new TextEncoder().encode(env().JWT_SECRET);
const secure = () => env().NODE_ENV === "production";
export function issueCsrf(response: Response) {
  const token = randomBytes(32).toString("base64url");
  response.cookie(CSRF, token, {
    httpOnly: false,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 86400000,
  });
  return token;
}
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const a = req.cookies[CSRF] as string | undefined,
    b = req.get("x-csrf-token");
  if (
    !a ||
    !b ||
    a.length !== b.length ||
    !timingSafeEqual(Buffer.from(a), Buffer.from(b))
  ) {
    res.status(403).json({
      error: {
        code: "CSRF_INVALID",
        message: "CSRF token is missing or invalid.",
        requestId: res.locals.requestId,
      },
    });
    return;
  }
  next();
}
export async function setAccessCookie(
  res: Response,
  id: string,
  username: string,
) {
  const jwt = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
  res.cookie(ACCESS, jwt, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 3600000,
  });
}
export function clearAccessCookie(res: Response) {
  res.clearCookie(ACCESS, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
  });
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const jwt = req.cookies[ACCESS] as string | undefined;
  if (!jwt) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        requestId: res.locals.requestId,
      },
    });
    return;
  }
  try {
    const { payload } = await jwtVerify(jwt, secret(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.username !== "string")
      throw new Error("Invalid claims");
    res.locals.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        requestId: res.locals.requestId,
      },
    });
  }
}
