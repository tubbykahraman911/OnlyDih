import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ModerationStatus, PurchaseStatus, ReportStatus, SubscriptionStatus, TipStatus } from "@prisma/client";

const moderationRouter = Router();
const requireAdmin = requireRole(["ADMIN"]);

moderationRouter.post("/reports", requireAuth, async (req, res) => {
  const body = z
    .object({
      reason: z.string().min(3).max(1000),
      targetUserId: z.string().uuid().optional(),
      postId: z.string().optional(),
      messageId: z.string().optional(),
      mediaId: z.string().optional()
    })
    .parse(req.body);

  if (!body.targetUserId && !body.postId && !body.messageId && !body.mediaId) {
    return res.status(400).json({ error: { message: "At least one target is required" } });
  }

  const reporterId = req.user!.id;

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetUserId: body.targetUserId ?? null,
      postId: body.postId ?? null,
      messageId: body.messageId ?? null,
      mediaId: body.mediaId ?? null,
      reason: body.reason,
      status: ReportStatus.OPEN
    }
  });

  await prisma.auditLog.create({
    data: {
      adminId: null,
      action: "REPORT_CREATED",
      entity: "Report",
      entityId: report.id,
      ip: req.ip,
      metadata: {
        reporterId,
        targetUserId: body.targetUserId ?? null
      }
    }
  });

  res.json({ ok: true, reportId: report.id });
});

moderationRouter.post("/blocks", requireAuth, async (req, res) => {
  const body = z.object({ blockedId: z.string().uuid() }).parse(req.body);
  const blockerId = req.user!.id;
  const blockedId = body.blockedId;

  if (blockedId === blockerId) {
    return res.status(400).json({ error: { message: "Cannot block yourself" } });
  }

  const exists = await prisma.block.findFirst({ where: { blockerId, blockedId } });
  if (exists) return res.json({ ok: true, blocked: true });

  await prisma.block.create({ data: { blockerId, blockedId } });
  res.json({ ok: true, blocked: true });
});

moderationRouter.get("/admin/moderation/queue", requireAuth, requireAdmin, async (req, res) => {
  const pendingMedia = await prisma.media.findMany({
    where: { moderationStatus: ModerationStatus.PENDING },
    take: 30,
    orderBy: { createdAt: "desc" },
    select: { id: true, ownerId: true, postId: true, mimeType: true, createdAt: true, moderationStatus: true, csamCheckStatus: true }
  });

  const openReports = await prisma.report.findMany({
    where: { status: ReportStatus.OPEN },
    take: 30,
    orderBy: { createdAt: "desc" },
    include: { reporter: { select: { id: true, handle: true } } }
  });

  res.json({ pendingMedia, openReports });
});

moderationRouter.post(
  "/admin/media/:id/moderate",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ action: z.enum(["approve", "reject", "flag"]) }).parse(req.body);

    const nextStatus =
      body.action === "approve"
        ? ModerationStatus.APPROVED
        : body.action === "reject"
          ? ModerationStatus.REJECTED
          : ModerationStatus.FLAGGED;

    const media = await prisma.media.update({
      where: { id: params.id },
      data: { moderationStatus: nextStatus }
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "MEDIA_MODERATION_UPDATED",
        entity: "Media",
        entityId: media.id,
        ip: req.ip,
        metadata: { nextStatus }
      }
    });

    res.json({ ok: true, mediaId: media.id, moderationStatus: media.moderationStatus });
  }
);

moderationRouter.post(
  "/admin/reports/:id/resolve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ resolve: z.boolean().optional() }).parse(req.body);
    void body;

    const report = await prisma.report.update({
      where: { id: params.id },
      data: {
        status: ReportStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: req.user!.id
      }
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "REPORT_RESOLVED",
        entity: "Report",
        entityId: report.id,
        ip: req.ip
      }
    });

    res.json({ ok: true, reportId: report.id });
  }
);

moderationRouter.post(
  "/admin/users/:id/ban",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ banned: z.boolean() }).parse(req.body);

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { isBanned: body.banned }
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "USER_BAN_UPDATED",
        entity: "User",
        entityId: user.id,
        ip: req.ip,
        metadata: { banned: body.banned }
      }
    });

    res.json({ ok: true, userId: user.id, isBanned: user.isBanned });
  }
);

moderationRouter.get("/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
  const [userCount, creatorCount, mediaPendingCount, openReportCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "CREATOR" } }),
    prisma.media.count({ where: { moderationStatus: ModerationStatus.PENDING } }),
    prisma.report.count({ where: { status: ReportStatus.OPEN } })
  ]);

  const [subscriptionsActive, purchasesSucceeded, tipsSucceeded] = await Promise.all([
    prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
    prisma.purchase.count({ where: { status: PurchaseStatus.SUCCEEDED } }),
    prisma.tip.count({ where: { status: TipStatus.SUCCEEDED } })
  ]);

  res.json({
    userCount,
    creatorCount,
    mediaPendingCount,
    openReportCount,
    subscriptionsActive,
    purchasesSucceeded,
    tipsSucceeded
  });
});

export { moderationRouter };

