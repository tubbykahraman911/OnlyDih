import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { deleteObject, signGetObject } from "../lib/r2.js";
import { ModerationStatus, PurchaseStatus, SubscriptionStatus } from "@prisma/client";

const mediaRouter = Router();

mediaRouter.get("/:id/url", requireAuth, async (req, res) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const requesterId = req.user!.id;

  const media = await prisma.media.findUnique({
    where: { id: params.id },
    include: {
      post: {
        include: {
          creatorProfile: false
        }
      },
      chatMessage: {
        include: {
          thread: true
        }
      }
    }
  });

  if (!media) return res.status(404).json({ error: { message: "Not found" } });

  const isOwner = media.ownerId === requesterId;
  const isApprovedOrOwner = media.moderationStatus === ModerationStatus.APPROVED || isOwner;
  if (!isApprovedOrOwner) {
    return res.status(403).json({ error: { message: "Media not available" } });
  }

  let allowed = false;

  if (media.post) {
    // Post media permissions
    const creatorId = media.post.creatorId;
    switch (media.post.visibility) {
      case "PUBLIC":
      case "STORY":
      case "HIGHLIGHT":
        allowed = true;
        break;
      case "SUBSCRIBERS": {
        const sub = await prisma.subscription.findFirst({
          where: {
            fanId: requesterId,
            creatorId,
            status: SubscriptionStatus.ACTIVE
          }
        });
        allowed = !!sub;
        break;
      }
      case "PPV": {
        const purchase = await prisma.purchase.findFirst({
          where: {
            buyerId: requesterId,
            sellerId: creatorId,
            postId: media.postId ?? null,
            status: PurchaseStatus.SUCCEEDED
          }
        });
        allowed = !!purchase;
        break;
      }
      default:
        allowed = false;
    }
  } else if (media.chatMessage) {
    const msg = media.chatMessage;
    const thread = msg.thread;

    // Only participants can view chat attachments.
    const isParticipant = requesterId === thread.creatorId || requesterId === thread.fanId;
    if (!isParticipant) allowed = false;
    else if (!msg.ppvUnlockPriceCents) allowed = true;
    else {
      const purchase = await prisma.purchase.findFirst({
        where: {
          buyerId: requesterId,
          sellerId: thread.creatorId,
          chatMessageId: msg.id,
          status: PurchaseStatus.SUCCEEDED
        }
      });
      allowed = !!purchase;
    }
  } else {
    // Analyzer-only / orphaned media: strictly owner-only.
    allowed = isOwner;
  }

  if (!allowed) return res.status(403).json({ error: { message: "Forbidden" } });

  const signed = await signGetObject({ key: media.r2Key, expiresInSeconds: 120 });
  res.json({ signedGetUrl: signed.signedUrl, expiresInSeconds: signed.expiresInSeconds });
});

mediaRouter.delete("/:id", requireAuth, async (req, res) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const requester = req.user!;

  const media = await prisma.media.findUnique({ where: { id: params.id } });
  if (!media) return res.status(404).json({ error: { message: "Not found" } });

  const isOwner = media.ownerId === requester.id;
  const isAdmin = requester.role === "ADMIN";
  if (!isOwner && !isAdmin) return res.status(403).json({ error: { message: "Forbidden" } });

  await Promise.allSettled([
    deleteObject({ key: media.r2Key }),
    prisma.media.delete({ where: { id: media.id } })
  ]);

  res.json({ ok: true });
});

export { mediaRouter };

