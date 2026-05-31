import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "../lib/audit.js";
import { enqueueAnalysis } from "../lib/analysisQueue.js";
import { hashRequestValue, randomToken } from "../lib/crypto.js";
import { createPresignedUploadUrl, deletePrivateObject } from "../lib/storage.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const uploadsRouter = Router();

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 10 * 1024 * 1024;
const consentTextVersion = "phase1-private-analysis-v1";

async function requireVerified(userId: string) {
  const verification = await prisma.verificationStatus.findFirst({
    where: { userId, status: "verified", ageOver18Confirmed: true },
    orderBy: { verifiedAt: "desc" }
  });
  return Boolean(verification);
}

uploadsRouter.post("/presign", requireAuth, rateLimit("uploads_presign", 20, 60 * 60), async (req, res) => {
  if (!(await requireVerified(req.user!.id))) {
    return res.status(403).json({ error: { message: "18+ verification is required before uploading" } });
  }

  const parsed = z
    .object({
      originalFilename: z.string().min(1).max(160),
      mimeType: z.string(),
      fileSize: z.number().int().positive().max(maxFileSize)
    })
    .safeParse(req.body);
  if (!parsed.success || !allowedImageTypes.has(parsed.data.mimeType)) {
    return res.status(400).json({ error: { message: "Unsupported image file" } });
  }

  const extension = parsed.data.originalFilename.split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") ?? "img";
  const storageKey = `private/${req.user!.id}/${randomToken(18)}.${extension}`;
  const upload = await prisma.upload.create({
    data: {
      userId: req.user!.id,
      storageKey,
      originalFilename: parsed.data.originalFilename,
      mimeType: parsed.data.mimeType,
      fileSize: parsed.data.fileSize
    }
  });
  const uploadUrl = await createPresignedUploadUrl(storageKey, parsed.data.mimeType);
  await auditLog(req.user!.id, auditActions.uploadCreated, { uploadId: upload.id, mimeType: upload.mimeType, fileSize: upload.fileSize });
  return res.json({ uploadId: upload.id, uploadUrl, expiresInSeconds: 300 });
});

uploadsRouter.post("/complete", requireAuth, rateLimit("uploads_complete", 20, 60 * 60), async (req, res) => {
  const parsed = z
    .object({
      uploadId: z.string().min(1),
      consent: z.object({
        isPersonInContent: z.literal(true),
        isAdult: z.literal(true),
        privateAnalysisConsent: z.literal(true),
        understandsPrivateResult: z.literal(true)
      })
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Consent is required before analysis" } });

  const upload = await prisma.upload.findFirst({ where: { id: parsed.data.uploadId, userId: req.user!.id, deletedAt: null } });
  if (!upload) return res.status(404).json({ error: { message: "Upload not found" } });
  if (!(await requireVerified(req.user!.id))) {
    return res.status(403).json({ error: { message: "18+ verification is required before uploading" } });
  }

  await prisma.consentEvent.upsert({
    where: { uploadId: upload.id },
    create: {
      userId: req.user!.id,
      uploadId: upload.id,
      consentTextVersion,
      ipAddressHash: hashRequestValue(req.ip, process.env.SESSION_SECRET ?? "dev"),
      userAgentHash: hashRequestValue(req.header("user-agent"), process.env.SESSION_SECRET ?? "dev")
    },
    update: {}
  });
  await auditLog(req.user!.id, auditActions.consentAccepted, { uploadId: upload.id, consentTextVersion });
  await enqueueAnalysis(upload.id);
  return res.json({ uploadId: upload.id, status: "pending" });
});

uploadsRouter.get("/", requireAuth, async (req, res) => {
  const uploads = await prisma.upload.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      status: true,
      moderationStatus: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      analysisResult: true
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ uploads });
});

uploadsRouter.delete("/:id", requireAuth, async (req, res) => {
  const upload = await prisma.upload.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!upload) return res.status(404).json({ error: { message: "Upload not found" } });
  await deletePrivateObject(upload.storageKey).catch(() => undefined);
  await prisma.analysisResult.updateMany({ where: { uploadId: upload.id }, data: { deletedAt: new Date() } });
  await prisma.upload.update({ where: { id: upload.id }, data: { status: "deleted", deletedAt: new Date() } });
  await auditLog(req.user!.id, auditActions.uploadDeleted, { uploadId: upload.id });
  return res.json({ ok: true });
});
