import { Queue, Worker } from "bullmq";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "./audit.js";
import { deletePrivateObject } from "./storage.js";
import { AnalyzerProviderError, runAnalyzer, runPlaceholderModeration } from "./analyzer.js";

const queueName = "private-analysis";
let queue: Queue<{ uploadId: string }> | null = null;

function connection() {
  if (!process.env.REDIS_URL) return null;
  const url = new URL(process.env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
    maxRetriesPerRequest: null
  };
}

export async function enqueueAnalysis(uploadId: string) {
  const conn = connection();
  if (!conn) {
    setTimeout(() => void processUpload(uploadId), 20);
    return;
  }
  if (!queue) queue = new Queue(queueName, { connection: conn });
  await queue.add("analyze", { uploadId }, { removeOnComplete: true, removeOnFail: 100 });
}

export function startAnalysisWorker() {
  const conn = connection();
  if (!conn) return null;
  return new Worker(
    queueName,
    async (job) => {
      await processUpload(job.data.uploadId);
    },
    { connection: conn }
  );
}

export async function processUpload(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { consentEvent: true }
  });
  if (!upload || upload.deletedAt || upload.status === "deleted") return;
  if (!upload.consentEvent) {
    await prisma.upload.update({ where: { id: upload.id }, data: { status: "failed" } });
    return;
  }

  await prisma.upload.update({ where: { id: upload.id }, data: { status: "processing" } });
  await auditLog(upload.userId, auditActions.uploadProcessingStarted, { uploadId: upload.id });

  const moderation = await runPlaceholderModeration();
  if (moderation === "escalated") {
    await prisma.upload.update({
      where: { id: upload.id },
      data: { status: "quarantined", moderationStatus: "escalated" }
    });
    await prisma.safetyFlag.create({
      data: { userId: upload.userId, uploadId: upload.id, flagType: "moderation_escalated", severity: "high" }
    });
    await auditLog(upload.userId, auditActions.moderationCompleted, { uploadId: upload.id, moderation });
    return;
  }

  if (moderation === "rejected") {
    await prisma.upload.update({
      where: { id: upload.id },
      data: { status: "failed", moderationStatus: "rejected" }
    });
    await auditLog(upload.userId, auditActions.moderationCompleted, { uploadId: upload.id, moderation });
    return;
  }

  await prisma.upload.update({ where: { id: upload.id }, data: { moderationStatus: "approved" } });
  await auditLog(upload.userId, auditActions.moderationCompleted, { uploadId: upload.id, moderation });

  let result;
  try {
    // TODO: Strip image metadata before any real analyzer provider receives raw bytes.
    result = await runAnalyzer(upload);
  } catch (error) {
    await prisma.upload.update({ where: { id: upload.id }, data: { status: "failed" } });
    await auditLog(upload.userId, "analysis_failed", {
      uploadId: upload.id,
      reason: error instanceof AnalyzerProviderError ? error.message : "Private analysis failed safely."
    });
    return;
  }
  await prisma.analysisResult.upsert({
    where: { uploadId: upload.id },
    create: {
      uploadId: upload.id,
      userId: upload.userId,
      lengthScore: result.length_score,
      girthScore: result.girth_score,
      skinClarityScore: result.skin_clarity_score,
      presentationScore: result.presentation_score,
      pictureQualityScore: result.picture_quality_score,
      confidenceScore: result.confidence_score,
      totalScore: result.total_score,
      confidenceLevel: result.confidence_level,
      warningsJson: result.warnings
    },
    update: {
      lengthScore: result.length_score,
      girthScore: result.girth_score,
      skinClarityScore: result.skin_clarity_score,
      presentationScore: result.presentation_score,
      pictureQualityScore: result.picture_quality_score,
      confidenceScore: result.confidence_score,
      totalScore: result.total_score,
      confidenceLevel: result.confidence_level,
      warningsJson: result.warnings,
      deletedAt: null
    }
  });
  await prisma.upload.update({ where: { id: upload.id }, data: { status: "completed" } });
  await auditLog(upload.userId, auditActions.analysisCompleted, { uploadId: upload.id });
}

export async function deleteExpiredRawUploads() {
  const hours = Number(process.env.RAW_UPLOAD_RETENTION_HOURS ?? "24");
  const cutoff = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);
  const uploads = await prisma.upload.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: cutoff },
      status: { in: ["completed", "failed", "quarantined"] }
    },
    take: 100
  });

  for (const upload of uploads) {
    await deletePrivateObject(upload.storageKey).catch(() => undefined);
    await prisma.upload.update({ where: { id: upload.id }, data: { deletedAt: new Date() } });
  }
}
