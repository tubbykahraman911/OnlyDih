import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "../lib/audit.js";
import { deletePrivateObject } from "../lib/storage.js";
import { requireAuth } from "../middleware/auth.js";

export const privacyRouter = Router();

privacyRouter.post("/delete-analysis/:id", requireAuth, async (req, res) => {
  const result = await prisma.analysisResult.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { upload: true }
  });
  if (!result) return res.status(404).json({ error: { message: "Analysis not found" } });

  await deletePrivateObject(result.upload.storageKey).catch(() => undefined);
  await prisma.analysisResult.update({ where: { id: result.id }, data: { deletedAt: new Date() } });
  await prisma.upload.update({ where: { id: result.uploadId }, data: { status: "deleted", deletedAt: new Date() } });
  await auditLog(req.user!.id, auditActions.uploadDeleted, { uploadId: result.uploadId, analysisResultId: result.id });
  return res.json({ ok: true });
});

privacyRouter.post("/delete-account", requireAuth, async (req, res) => {
  const request = await prisma.deletionRequest.create({ data: { userId: req.user!.id, status: "processing" } });
  await auditLog(req.user!.id, auditActions.deletionRequested, { deletionRequestId: request.id });

  const uploads = await prisma.upload.findMany({ where: { userId: req.user!.id, deletedAt: null } });
  for (const upload of uploads) {
    await deletePrivateObject(upload.storageKey).catch(() => undefined);
  }
  await prisma.analysisResult.updateMany({ where: { userId: req.user!.id, deletedAt: null }, data: { deletedAt: new Date() } });
  await prisma.upload.updateMany({ where: { userId: req.user!.id, deletedAt: null }, data: { status: "deleted", deletedAt: new Date() } });
  await prisma.session.deleteMany({ where: { userId: req.user!.id } });
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      deletedAt: new Date(),
      email: `deleted-${req.user!.id}@deleted.local`,
      username: `deleted_${req.user!.id}`
    }
  });
  await prisma.deletionRequest.update({ where: { id: request.id }, data: { status: "completed", completedAt: new Date() } });
  await auditLog(req.user!.id, auditActions.deletionCompleted, { deletionRequestId: request.id });
  return res.json({ ok: true });
});

privacyRouter.get("/export", requireAuth, async (req, res) => {
  const [user, verification, uploads, results, consents, deletionRequests] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, username: true, createdAt: true, updatedAt: true, deletedAt: true } }),
    prisma.verificationStatus.findMany({ where: { userId: req.user!.id } }),
    prisma.upload.findMany({ where: { userId: req.user!.id }, select: { id: true, originalFilename: true, mimeType: true, fileSize: true, status: true, moderationStatus: true, createdAt: true, updatedAt: true, deletedAt: true } }),
    prisma.analysisResult.findMany({ where: { userId: req.user!.id } }),
    prisma.consentEvent.findMany({ where: { userId: req.user!.id } }),
    prisma.deletionRequest.findMany({ where: { userId: req.user!.id } })
  ]);
  return res.json({ user, verification, uploads, results, consents, deletionRequests });
});
