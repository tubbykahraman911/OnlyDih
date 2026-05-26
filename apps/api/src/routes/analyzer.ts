import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { deleteObject, signGetObject } from "../lib/r2.js";
import { AnalyzerJobStatus } from "@prisma/client";

const analyzerRouter = Router();

const submitSchema = z.object({
  mediaId: z.string().min(1),
  consented: z.boolean(),
  autoDeleteAfterProcessing: z.boolean().optional()
});

async function callAiService({
  jobId,
  downloadUrl,
  consented,
  autoDeleteAfterProcessing
}: {
  jobId: string;
  downloadUrl: string;
  consented: boolean;
  autoDeleteAfterProcessing: boolean;
}) {
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  if (!aiServiceUrl) throw new Error("Missing AI_SERVICE_URL");

  const resp = await fetch(`${aiServiceUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      consented,
      downloadUrl,
      autoDeleteAfterProcessing
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AI service error: ${resp.status} ${text}`);
  }

  return (await resp.json()) as {
    jobId: string;
    status: string;
    overallScore?: number | null;
    percentile?: number | null;
    label?: string | null;
    confidence?: number | null;
    feedback?: { humor?: string; confidence?: string } | null;
    radar?: Record<string, number> | null;
    aiSummary?: string | null;
    csamCheck?: any;
  };
}

async function processJob(jobId: string) {
  const job = await prisma.analyzerJob.findUnique({
    where: { id: jobId },
    include: { media: true }
  });
  if (!job || !job.media) return;

  try {
    const downloadSigned = await signGetObject({ key: job.media.r2Key, expiresInSeconds: 180 });

    const result = await callAiService({
      jobId,
      downloadUrl: downloadSigned.signedUrl,
      consented: true,
      autoDeleteAfterProcessing: job.autoDeleteAfterProcessing
    });

    await prisma.analyzerJob.update({
      where: { id: jobId },
      data: { status: AnalyzerJobStatus.COMPLETED }
    });

    await prisma.analyzerResult.upsert({
      where: { jobId: jobId },
      create: {
        jobId,
        overallScore: result.overallScore ?? 0,
        percentile: result.percentile ?? 0,
        label: result.label ?? "Balanced Build",
        confidence: result.confidence ?? null,
        radar: result.radar ?? {},
        feedback: result.feedback ?? {},
        aiSummary: result.aiSummary ?? "Entertainment-only summary."
      },
      update: {
        overallScore: result.overallScore ?? 0,
        percentile: result.percentile ?? 0,
        label: result.label ?? "Balanced Build",
        confidence: result.confidence ?? null,
        radar: result.radar ?? {},
        feedback: result.feedback ?? {},
        aiSummary: result.aiSummary ?? "Entertainment-only summary."
      }
    });

    if (job.autoDeleteAfterProcessing) {
      await Promise.allSettled([
        deleteObject({ key: job.media.r2Key }),
        prisma.media.delete({ where: { id: job.media.id } })
      ]);
    }
  } catch (e) {
    await prisma.analyzerJob.update({
      where: { id: jobId },
      data: { status: AnalyzerJobStatus.FAILED }
    });
  }
}

analyzerRouter.post("/submit", requireAuth, async (req, res) => {
  const body = submitSchema.parse(req.body);
  const userId = req.user!.id;

  if (!body.consented) {
    return res.status(400).json({ error: { message: "Consent required" } });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ageVerifiedAt: true } });
  if (!user?.ageVerifiedAt) {
    return res.status(403).json({ error: { message: "18+ gate required" } });
  }

  const media = await prisma.media.findUnique({
    where: { id: body.mediaId },
    select: { id: true, ownerId: true, r2Key: true, isAdult: true }
  });
  if (!media) return res.status(404).json({ error: { message: "Media not found" } });
  if (media.ownerId !== userId) return res.status(403).json({ error: { message: "Forbidden" } });

  const job = await prisma.analyzerJob.create({
    data: {
      userId,
      mediaId: media.id,
      status: AnalyzerJobStatus.QUEUED,
      consentedAt: new Date(),
      autoDeleteAfterProcessing: body.autoDeleteAfterProcessing ?? true,
      settings: {
        autoDeleteAfterProcessing: body.autoDeleteAfterProcessing ?? true
      }
    }
  });

  // Fire-and-forget processing for MVP.
  void processJob(job.id);

  res.json({ ok: true, jobId: job.id });
});

analyzerRouter.get("/jobs", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const jobs = await prisma.analyzerJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { result: true }
  });

  res.json({
    items: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      createdAt: j.createdAt,
      autoDeleteAfterProcessing: j.autoDeleteAfterProcessing,
      result: j.result
    }))
  });
});

analyzerRouter.get("/jobs/:id", requireAuth, async (req, res) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const userId = req.user!.id;

  const job = await prisma.analyzerJob.findUnique({
    where: { id: params.id },
    include: { result: true }
  });
  if (!job || job.userId !== userId) return res.status(404).json({ error: { message: "Not found" } });

  res.json({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    autoDeleteAfterProcessing: job.autoDeleteAfterProcessing,
    result: job.result
  });
});

export { analyzerRouter };

