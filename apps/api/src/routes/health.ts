import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const responseSchema = z.object({
    ok: z.boolean(),
    service: z.literal("onlydihs-api"),
    environment: z.string(),
    database: z.object({
      ok: z.boolean(),
      message: z.string().optional()
    })
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    const response = responseSchema.parse({
      ok: true,
      service: "onlydihs-api",
      environment: process.env.NODE_ENV ?? "development",
      database: { ok: true }
    });
    return res.json(response);
  } catch {
    const response = responseSchema.parse({
      ok: false,
      service: "onlydihs-api",
      environment: process.env.NODE_ENV ?? "development",
      database: {
        ok: false,
        message:
          process.env.NODE_ENV === "production"
            ? "Database unavailable."
            : "Database unavailable. Confirm PostgreSQL is running and migrations have been applied."
      }
    });
    return res.status(503).json(response);
  }
});

