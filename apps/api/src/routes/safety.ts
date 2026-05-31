import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const safetyRouter = Router();

safetyRouter.post("/report", requireAuth, rateLimit("safety_report", 20, 60 * 60), async (req, res) => {
  const parsed = z
    .object({
      uploadId: z.string().optional(),
      flagType: z.string().min(3).max(80),
      notes: z.string().max(1000).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid safety report" } });

  if (parsed.data.uploadId) {
    const upload = await prisma.upload.findFirst({ where: { id: parsed.data.uploadId, userId: req.user!.id } });
    if (!upload) return res.status(404).json({ error: { message: "Upload not found" } });
  }

  const flag = await prisma.safetyFlag.create({
    data: {
      userId: req.user!.id,
      uploadId: parsed.data.uploadId,
      flagType: parsed.data.flagType,
      severity: "user_report",
      notes: parsed.data.notes
    }
  });
  return res.status(201).json({ flag });
});

safetyRouter.get("/status", requireAuth, async (req, res) => {
  const flags = await prisma.safetyFlag.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return res.json({
    status: {
      phase: "phase_1_private_only",
      reportingAvailable: true,
      publicInteractionEnabled: false,
      flags
    }
  });
});
