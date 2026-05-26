import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const authHeaderSchema = z
  .string()
  .regex(/^Bearer\s+.+$/, "Expected Bearer token");

export type AuthedAppUser = {
  id: string;
  role: "FAN" | "CREATOR" | "ADMIN";
  isBanned: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __sizeai_supabase_admin: ReturnType<typeof createClient> | undefined;
}

function getSupabaseAdmin() {
  if (global.__sizeai_supabase_admin) return global.__sizeai_supabase_admin;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  global.__sizeai_supabase_admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return global.__sizeai_supabase_admin;
}

async function getBearerToken(req: Request) {
  const raw = req.header("authorization");
  if (raw) return authHeaderSchema.parse(raw).replace(/^Bearer\s+/, "");

  // EventSource cannot set Authorization headers; allow passing an access token
  // as a query param for authenticated SSE connections (MVP convenience).
  const q = req.query?.access_token;
  if (typeof q === "string" && q.length > 10) return q;
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await getBearerToken(req);
    if (!token) return res.status(401).json({ error: { message: "Unauthorized" } });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const appUser = await prisma.user.upsert({
      where: { id: userData.user.id },
      create: {
        id: userData.user.id,
        email: userData.user.email ?? null
      },
      update: {}
    });

    if (appUser.isBanned) {
      return res.status(403).json({ error: { message: "Account disabled" } });
    }

    req.user = {
      id: appUser.id,
      role: appUser.role,
      isBanned: appUser.isBanned
    } satisfies AuthedAppUser;

    next();
  } catch (e) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedAppUser;
  }
}

export function requireRole(roles: Array<AuthedAppUser["role"]>) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return res.status(401).json({ error: { message: "Unauthorized" } });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    return next();
  };
}

