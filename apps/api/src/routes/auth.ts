import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "../lib/audit.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto.js";
import { clearSessionCookies, requireAuth, requireCsrf, setSessionCookies } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const authRouter = Router();

const authSchema = z.object({
  email: z.string().email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  username: z
    .string({ required_error: "Username is required." })
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be 32 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores."),
  password: z
    .string({ required_error: "Password is required." })
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be 128 characters or fewer.")
});

const loginSchema = authSchema.pick({ email: true, password: true });

function firstValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request details.";
}

function databaseUnavailableMessage() {
  return process.env.NODE_ENV === "production"
    ? "Service temporarily unavailable."
    : "Database unavailable. Start PostgreSQL and run Prisma migrations before signing up.";
}

function authDebug(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[auth] ${message}`, details ?? "");
}

async function createSession(userId: string) {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(sessionToken),
      csrfTokenHash: sha256(csrfToken),
      expiresAt
    }
  });
  return { sessionToken, csrfToken, expiresAt };
}

authRouter.post("/signup", rateLimit("signup", 8, 60 * 15), async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: firstValidationMessage(parsed.error) } });

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await prisma.user.create({
      data: { email: parsed.data.email, username: parsed.data.username, passwordHash }
    });
    const session = await createSession(user.id);
    setSessionCookies(res, session.sessionToken, session.csrfToken, session.expiresAt);
    await auditLog(user.id, auditActions.login, { method: "signup" });
    return res.status(201).json({ user: { id: user.id, email: user.email, username: user.username }, csrfToken: session.csrfToken });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
      if (target.includes("email")) return res.status(409).json({ error: { message: "Email already exists." } });
      if (target.includes("username")) return res.status(409).json({ error: { message: "Username already exists." } });
      return res.status(409).json({ error: { message: "Email or username already exists." } });
    }
    return res.status(503).json({ error: { message: databaseUnavailableMessage() } });
  }
});

authRouter.post("/login", rateLimit("login", 10, 60 * 15), async (req, res) => {
  authDebug("Login route was hit");
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    authDebug("Login request validation failed", { reason: firstValidationMessage(parsed.error) });
    return res.status(400).json({ error: { message: firstValidationMessage(parsed.error) } });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    authDebug("Login user lookup completed", { found: Boolean(user), deleted: Boolean(user?.deletedAt) });
    const passwordMatched = user && !user.deletedAt ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    authDebug("Login password verification completed", { matched: passwordMatched });
    if (!user || user.deletedAt || !passwordMatched) {
      return res.status(401).json({ error: { message: "Invalid email or password." } });
    }

    const session = await createSession(user.id);
    authDebug("Login session was created", { userId: user.id, expiresAt: session.expiresAt.toISOString() });
    setSessionCookies(res, session.sessionToken, session.csrfToken, session.expiresAt);
    await auditLog(user.id, auditActions.login, { method: "password" });
    return res.json({ user: { id: user.id, email: user.email, username: user.username }, csrfToken: session.csrfToken });
  } catch (error) {
    authDebug("Login failed while talking to the database", { error: error instanceof Error ? error.message : "unknown" });
    return res.status(503).json({ error: { message: process.env.NODE_ENV === "production" ? "Service temporarily unavailable." : "Database unavailable. Start PostgreSQL and run Prisma migrations before logging in." } });
  }
});

authRouter.post("/logout", requireAuth, requireCsrf, async (req, res) => {
  if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
  clearSessionCookies(res);
  await auditLog(req.user?.id ?? null, auditActions.logout);
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const verification = await prisma.verificationStatus.findFirst({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" }
  });
  return res.json({
    user: req.user,
    csrfToken: req.headers.cookie?.match(/od_csrf=([^;]+)/)?.[1] ?? null,
    verificationStatus: verification?.status ?? "pending"
  });
});
