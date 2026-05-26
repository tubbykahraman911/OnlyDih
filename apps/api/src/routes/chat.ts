import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { publish, subscribe } from "../lib/redis.js";
import { ModerationStatus, PurchaseStatus } from "@prisma/client";

const chatRouter = Router();

function assertParticipant(thread: { creatorId: string; fanId: string }, userId: string) {
  return thread.creatorId === userId || thread.fanId === userId;
}

async function isMessageUnlocked({
  viewerId,
  messageId
}: {
  viewerId: string;
  messageId: string;
}) {
  const purchase = await prisma.purchase.findFirst({
    where: {
      buyerId: viewerId,
      chatMessageId: messageId,
      status: PurchaseStatus.SUCCEEDED
    }
  });
  return !!purchase;
}

async function sanitizeMessageForViewer(viewerId: string, msgId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: msgId },
    include: {
      attachmentMedia: true,
      thread: true
    }
  });
  if (!message) return null;

  if (!assertParticipant(message.thread, viewerId)) return null;

  const blockedByViewer = await prisma.block.findFirst({
    where: { blockerId: viewerId, blockedId: message.senderId }
  });
  const blockedBySender = await prisma.block.findFirst({
    where: { blockerId: message.senderId, blockedId: viewerId }
  });
  if (blockedByViewer || blockedBySender) {
    return {
      id: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt,
      body: null,
      ppvUnlockPriceCents: message.ppvUnlockPriceCents,
      isLocked: true,
      attachmentMediaId: null
    };
  }

  const locked = !!message.ppvUnlockPriceCents;
  if (locked) {
    const unlocked = await isMessageUnlocked({ viewerId, messageId: message.id });
    if (!unlocked) {
      return {
        id: message.id,
        senderId: message.senderId,
        createdAt: message.createdAt,
        body: null,
        ppvUnlockPriceCents: message.ppvUnlockPriceCents,
        isLocked: true,
        attachmentMediaId: null
      };
    }
  }

  return {
    id: message.id,
    senderId: message.senderId,
    createdAt: message.createdAt,
    body: message.body,
    ppvUnlockPriceCents: message.ppvUnlockPriceCents,
    isLocked: false,
    attachmentMediaId:
      message.attachmentMediaId && message.attachmentMedia?.moderationStatus === ModerationStatus.APPROVED
        ? message.attachmentMediaId
        : null
  };
}

chatRouter.get("/", requireAuth, async (req, res) => {
  const viewerId = req.user!.id;

  const threads = await prisma.chatThread.findMany({
    where: { OR: [{ creatorId: viewerId }, { fanId: viewerId }] },
    include: {
      creator: { select: { id: true, handle: true, creatorProfile: { select: { badgeLevel: true } } } },
      fan: { select: { id: true, handle: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { attachmentMedia: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const items = await Promise.all(
    threads.map(async (t) => {
      const last = t.messages[0];
      const lastSanitized = last ? await sanitizeMessageForViewer(viewerId, last.id) : null;
      return {
        id: t.id,
        creatorId: t.creatorId,
        fanId: t.fanId,
        creator: { id: t.creator.id, handle: t.creator.handle, badgeLevel: t.creator.creatorProfile?.badgeLevel ?? null },
        fan: { id: t.fan.id, handle: t.fan.handle },
        lastMessage: lastSanitized
      };
    })
  );

  res.json({ items });
});

chatRouter.get("/:threadId/messages", requireAuth, async (req, res) => {
  const params = z.object({ threadId: z.string() }).parse(req.params);
  const viewerId = req.user!.id;

  const thread = await prisma.chatThread.findUnique({
    where: { id: params.threadId },
    include: { creator: true, fan: true }
  });
  if (!thread) return res.status(404).json({ error: { message: "Thread not found" } });
  if (!assertParticipant(thread, viewerId)) return res.status(403).json({ error: { message: "Forbidden" } });

  const messages = await prisma.chatMessage.findMany({
    where: { threadId: params.threadId },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { attachmentMedia: true }
  });

  const blockedByViewer = await prisma.block.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true }
  });
  const blockedByViewerSet = new Set(blockedByViewer.map((b) => b.blockedId));
  const blockedBySenderSetRaw = await prisma.block.findMany({
    where: { blockedId: viewerId },
    select: { blockerId: true }
  });
  const blockedBySenderSet = new Set(blockedBySenderSetRaw.map((b) => b.blockerId));

  const sanitized = await Promise.all(
    messages.map(async (m) => {
      if (blockedByViewerSet.has(m.senderId) || blockedBySenderSet.has(m.senderId)) {
        return {
          id: m.id,
          senderId: m.senderId,
          createdAt: m.createdAt,
          body: null,
          ppvUnlockPriceCents: m.ppvUnlockPriceCents,
          isLocked: true,
          attachmentMediaId: null
        };
      }
      const locked = !!m.ppvUnlockPriceCents;
      if (locked) {
        const unlocked = await isMessageUnlocked({ viewerId, messageId: m.id });
        if (!unlocked) {
          return {
            id: m.id,
            senderId: m.senderId,
            createdAt: m.createdAt,
            body: null,
            ppvUnlockPriceCents: m.ppvUnlockPriceCents,
            isLocked: true,
            attachmentMediaId: null
          };
        }
      }

      return {
        id: m.id,
        senderId: m.senderId,
        createdAt: m.createdAt,
        body: m.body,
        ppvUnlockPriceCents: m.ppvUnlockPriceCents,
        isLocked: false,
        attachmentMediaId: m.attachmentMediaId && m.attachmentMedia?.moderationStatus === ModerationStatus.APPROVED ? m.attachmentMediaId : null
      };
    })
  );

  res.json({ items: sanitized });
});

chatRouter.post("/:threadId/messages", requireAuth, async (req, res) => {
  const params = z.object({ threadId: z.string() }).parse(req.params);
  const body = z
    .object({
      body: z.string().min(1).max(3000),
      attachmentMediaId: z.string().optional(),
      ppvUnlockPriceCents: z.number().int().positive().optional()
    })
    .parse(req.body);

  const senderId = req.user!.id;

  const thread = await prisma.chatThread.findUnique({
    where: { id: params.threadId }
  });
  if (!thread) return res.status(404).json({ error: { message: "Thread not found" } });
  if (!assertParticipant(thread, senderId)) return res.status(403).json({ error: { message: "Forbidden" } });

  // Determine recipient (MVP: 1:1 DM).
  const recipientId = senderId === thread.creatorId ? thread.fanId : thread.creatorId;

  const blockedByRecipient = await prisma.block.findFirst({
    where: { blockerId: senderId, blockedId: recipientId }
  });
  const blockedBySender = await prisma.block.findFirst({
    where: { blockerId: recipientId, blockedId: senderId }
  });
  if (blockedByRecipient || blockedBySender) {
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  let attachmentMediaId: string | undefined = undefined;
  if (body.attachmentMediaId) {
    const media = await prisma.media.findUnique({ where: { id: body.attachmentMediaId } });
    if (!media) return res.status(404).json({ error: { message: "Media not found" } });
    const isOwner = media.ownerId === senderId;
    if (!isOwner && media.moderationStatus !== ModerationStatus.APPROVED) {
      return res.status(403).json({ error: { message: "Media not available" } });
    }
    attachmentMediaId = media.id;
  }

  const created = await prisma.chatMessage.create({
    data: {
      threadId: params.threadId,
      senderId,
      recipientId,
      body: body.body,
      attachmentMediaId: attachmentMediaId ?? null,
      ppvUnlockPriceCents: body.ppvUnlockPriceCents ?? null
    }
  });

  await publish(`chat:${params.threadId}`, { type: "message.created", messageId: created.id });

  res.json({ ok: true, messageId: created.id });
});

chatRouter.get("/:threadId/stream", requireAuth, async (req, res) => {
  const params = z.object({ threadId: z.string() }).parse(req.params);
  const viewerId = req.user!.id;

  const thread = await prisma.chatThread.findUnique({ where: { id: params.threadId } });
  if (!thread) return res.status(404).end();
  if (!assertParticipant(thread, viewerId)) return res.status(403).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write(`event: hello\n`);
  res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);

  const channel = `chat:${params.threadId}`;
  const unsubscribe = subscribe(channel, async (payload) => {
    if (payload && (payload as any).type === "message.created") {
      const messageId = (payload as any).messageId as string;
      const sanitized = await sanitizeMessageForViewer(viewerId, messageId);
      if (!sanitized) return;
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(sanitized)}\n\n`);
    }
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

export { chatRouter };

