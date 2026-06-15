import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { sha256 } from "../lib/crypto.js";

const sessionCookieName = "od_session";
const csrfCookieName = "od_csrf";

function authDebug(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[auth] ${message}`, details ?? "");
}

export type AuthedAppUser = {
  id: string;
  email: string;
  username: string;
};

declare global {
  // Express request augmentation uses a namespace declaration by design.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedAppUser;
      sessionId?: string;
    }
  }
}

export function parseCookies(req: Request) {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function secureFlag() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function sameSitePolicy() {
  return process.env.NODE_ENV === "production" ? "None" : "Lax";
}

export function setSessionCookies(res: Response, sessionToken: string, csrfToken: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const sameSite = sameSitePolicy();
  res.setHeader("Set-Cookie", [
    `${sessionCookieName}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secureFlag()}`,
    `${csrfCookieName}=${encodeURIComponent(csrfToken)}; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secureFlag()}`
  ]);
  authDebug("Set-Cookie sent", { cookies: [sessionCookieName, csrfCookieName], secure: process.env.NODE_ENV === "production", sameSite, maxAge });
}

export function clearSessionCookies(res: Response) {
  const sameSite = sameSitePolicy();
  res.setHeader("Set-Cookie", [
    `${sessionCookieName}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secureFlag()}`,
    `${csrfCookieName}=; SameSite=${sameSite}; Path=/; Max-Age=0${secureFlag()}`
  ]);
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const sessionToken = parseCookies(req)[sessionCookieName];
  if (!sessionToken) {
    if (req.originalUrl === "/api/auth/me") authDebug("/api/auth/me did not receive a session cookie");
    return next();
  }
  if (req.originalUrl === "/api/auth/me") authDebug("/api/auth/me received a session cookie");

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(sessionToken) },
    include: { user: true }
  });

  if (!session || session.expiresAt <= new Date() || session.user.deletedAt) {
    if (req.originalUrl === "/api/auth/me") authDebug("/api/auth/me session was not valid", { found: Boolean(session), expired: session ? session.expiresAt <= new Date() : null });
    return next();
  }
  req.user = {
    id: session.user.id,
    email: session.user.email,
    username: session.user.username
  };
  req.sessionId = session.id;
  return next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await optionalAuth(req, res, () => undefined);
  if (!req.user) return res.status(401).json({ error: { message: "Unauthorized" } });
  return next();
}

export async function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!req.sessionId) return res.status(401).json({ error: { message: "Unauthorized" } });

  const csrfHeader = req.header("x-csrf-token");
  const csrfCookie = parseCookies(req)[csrfCookieName];
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: { message: "CSRF validation failed" } });
  }

  const session = await prisma.session.findUnique({ where: { id: req.sessionId } });
  if (!session || session.csrfTokenHash !== sha256(csrfHeader)) {
    return res.status(403).json({ error: { message: "CSRF validation failed" } });
  }
  return next();
}
