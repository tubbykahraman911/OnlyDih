import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "../lib/audit.js";
import { startPlaceholderVerification, verifyWebhookSignature } from "../lib/verificationProvider.js";
import { requireAuth, requireCsrf } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const verificationRouter = Router();

verificationRouter.get("/status", requireAuth, async (req, res) => {
  const status = await prisma.verificationStatus.findFirst({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ status: status?.status ?? "pending", verification: status });
});

verificationRouter.post("/start", requireAuth, requireCsrf, rateLimit("verification_start", 8, 60 * 60), async (req, res) => {
  const session = await startPlaceholderVerification(req.user!.id);
  const verification = await prisma.verificationStatus.create({
    data: {
      userId: req.user!.id,
      provider: session.provider,
      providerVerificationId: session.providerVerificationId,
      status: "pending",
      ageOver18Confirmed: false
    }
  });
  return res.json({ verificationId: verification.providerVerificationId, verificationUrl: session.verificationUrl });
});

const webhookSchema = z.object({
  providerVerificationId: z.string().min(1),
  status: z.enum(["verified", "failed", "expired"]),
  ageOver18Confirmed: z.boolean()
});

verificationRouter.post("/webhook", rateLimit("verification_webhook", 60, 60), async (req, res) => {
  const signature = req.header("x-verification-signature");
  if (!verifyWebhookSignature(signature, process.env.VERIFICATION_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: { message: "Invalid verification webhook" } });
  }
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid webhook payload" } });

  const status = parsed.data.status === "verified" && !parsed.data.ageOver18Confirmed ? "failed" : parsed.data.status;
  const updated = await prisma.verificationStatus.update({
    where: { providerVerificationId: parsed.data.providerVerificationId },
    data: {
      status,
      ageOver18Confirmed: parsed.data.ageOver18Confirmed,
      verifiedAt: status === "verified" ? new Date() : null
    }
  });
  await auditLog(updated.userId, auditActions.verificationUpdate, {
    provider: updated.provider,
    status: updated.status,
    ageOver18Confirmed: updated.ageOver18Confirmed
  });
  return res.json({ ok: true });
});
