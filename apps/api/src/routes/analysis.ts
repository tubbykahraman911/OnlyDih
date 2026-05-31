import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { enqueueAnalysis } from "../lib/analysisQueue.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const analysisRouter = Router();

analysisRouter.post("/start", requireAuth, rateLimit("analysis_start", 20, 60 * 60), async (req, res) => {
  const parsed = z.object({ uploadId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid upload" } });

  const upload = await prisma.upload.findFirst({
    where: { id: parsed.data.uploadId, userId: req.user!.id, deletedAt: null },
    include: { consentEvent: true }
  });
  if (!upload) return res.status(404).json({ error: { message: "Upload not found" } });
  if (!upload.consentEvent) return res.status(400).json({ error: { message: "Consent is required before analysis" } });
  if (upload.status === "quarantined" || upload.moderationStatus === "rejected") {
    return res.status(400).json({ error: { message: "This upload cannot be analyzed" } });
  }

  await enqueueAnalysis(upload.id);
  return res.json({ uploadId: upload.id, status: upload.status });
});

analysisRouter.get("/", requireAuth, rateLimit("analysis_list", 120, 60), async (req, res) => {
  const results = await prisma.analysisResult.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    include: { upload: { select: { id: true, status: true, moderationStatus: true, originalFilename: true, createdAt: true } } },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ results });
});

analysisRouter.get("/:id", requireAuth, rateLimit("analysis_fetch", 120, 60), async (req, res) => {
  const result = await prisma.analysisResult.findFirst({
    where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
    include: { upload: { select: { id: true, status: true, moderationStatus: true, originalFilename: true, createdAt: true } } }
  });
  if (result) return res.json({ result });

  const upload = await prisma.upload.findFirst({
    where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
    select: {
      id: true,
      status: true,
      moderationStatus: true,
      originalFilename: true,
      createdAt: true,
      analysisResult: {
        where: { deletedAt: null }
      }
    }
  });
  if (!upload) return res.status(404).json({ error: { message: "Analysis not found" } });
  return res.json({ result: upload.analysisResult, upload: { ...upload, analysisResult: undefined } });
});
