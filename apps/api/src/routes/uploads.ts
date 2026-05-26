import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import path from "node:path";
import { CsamCheckStatus, ModerationStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { signPutObject } from "../lib/r2.js";

const uploadsRouter = Router();

const purposeEnum = z.enum(["post", "chat", "analyzer"]);

uploadsRouter.post("/init", requireAuth, async (req, res) => {
  const body = z
    .object({
      purpose: purposeEnum,
      mimeType: z.string().min(1),
      fileName: z.string().min(1).optional(),
      // Optional hints; the client can provide them if it already knows.
      sizeBytes: z.number().int().positive().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      durationSec: z.number().positive().optional(),
      hash: z.string().optional()
    })
    .parse(req.body);

  const userId = req.user!.id;

  const ext = body.fileName ? path.extname(body.fileName).slice(0, 10) : "";
  const safeExt = ext && ext.length <= 5 ? ext.replace(/[^a-z0-9.]/gi, "") : "";

  const keyId = crypto.randomBytes(16).toString("hex");
  const r2Key = `private/uploads/${userId}/${body.purpose}/${keyId}${safeExt || ".bin"}`;

  const signed = await signPutObject({
    key: r2Key,
    contentType: body.mimeType,
    expiresInSeconds: 300
  });

  // We intentionally do NOT create the Media row at init time.
  // Only `complete` persists the metadata (prevents orphaned rows on failed uploads).
  res.json({ r2Key: signed.r2Key, signedPutUrl: signed.signedUrl, expiresInSeconds: signed.expiresInSeconds });
});

const completeSchema = z.object({
  r2Key: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
  hash: z.string().optional(),
  isAdult: z.boolean().optional(),

  // Optional linkage for permissions. For chat attachments, use `chatMessageId`.
  postId: z.string().optional(),
  chatMessageId: z.string().optional()
});

uploadsRouter.post("/complete", requireAuth, async (req, res) => {
  const body = completeSchema.parse(req.body);

  const ownerId = req.user!.id;

  // Verify the object belongs to the caller to prevent overwriting keys.
  if (!body.r2Key.includes(`/private/uploads/${ownerId}/`)) {
    return res.status(403).json({ error: { message: "Forbidden upload key" } });
  }

  const created = await prisma.media.create({
    data: {
      ownerId,
      postId: body.postId ?? null,
      // Media.chatMessage is inferred via ChatMessage.attachmentMediaId,
      // so `chatMessageId` is applied by updating ChatMessage after this create.
      r2Key: body.r2Key,
      mimeType: body.mimeType,
      sizeBytes: BigInt(body.sizeBytes),
      width: body.width ?? null,
      height: body.height ?? null,
      durationSec: body.durationSec ?? null,
      hash: body.hash ?? null,
      isAdult: body.isAdult ?? true,
      moderationStatus: ModerationStatus.PENDING,
      csamCheckStatus: CsamCheckStatus.NOT_RUN
    }
  });

  if (body.chatMessageId) {
    await prisma.chatMessage.update({
      where: { id: body.chatMessageId },
      data: { attachmentMediaId: created.id }
    });
  }

  res.json({ ok: true, mediaId: created.id });
});

export { uploadsRouter };

