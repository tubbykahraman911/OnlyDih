import { Router } from "express";
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { auditActions, auditLog } from "../lib/audit.js";
import {
  calculateAge,
  constructStripeWebhookEvent,
  startVerificationSession,
  verifyWebhookSignature
} from "../lib/verificationProvider.js";
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
  const session = await startVerificationSession(req.user!);
  const verification = await prisma.verificationStatus.create({
    data: {
      userId: req.user!.id,
      provider: session.provider,
      providerVerificationId: session.providerVerificationId,
      status: "pending",
      ageOver18Confirmed: false
    }
  });
  return res.json({
    provider: verification.provider,
    verificationId: verification.providerVerificationId,
    verificationUrl: session.verificationUrl
  });
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

function dobFromVerifiedOutputs(session: Stripe.Identity.VerificationSession) {
  const dob = session.verified_outputs?.dob;
  if (!dob?.year || !dob.month || !dob.day) return null;
  return { year: dob.year, month: dob.month, day: dob.day };
}

async function updateStripeVerification(session: Stripe.Identity.VerificationSession, status: "verified" | "failed" | "expired" | "pending_age_review", auditReason: string) {
  const verification = await prisma.verificationStatus.findUnique({
    where: { providerVerificationId: session.id }
  });
  if (!verification || verification.provider !== "stripe") return;

  const stripeUserId = session.client_reference_id ?? session.metadata?.userId;
  if (stripeUserId !== verification.userId) {
    await auditLog(verification.userId, auditActions.verificationUpdate, {
      provider: "stripe",
      status: "failed",
      reason: "stripe_user_mismatch"
    });
    await prisma.verificationStatus.update({
      where: { id: verification.id },
      data: { status: "failed", ageOver18Confirmed: false, verifiedAt: null }
    });
    return;
  }

  await prisma.verificationStatus.update({
    where: { id: verification.id },
    data: {
      status,
      ageOver18Confirmed: status === "verified",
      verifiedAt: status === "verified" ? new Date() : null
    }
  });
  await auditLog(verification.userId, auditActions.verificationUpdate, {
    provider: "stripe",
    status,
    reason: auditReason
  });
}

async function handleStripeVerified(session: Stripe.Identity.VerificationSession) {
  const dob = dobFromVerifiedOutputs(session);
  if (!dob) {
    await updateStripeVerification(session, "pending_age_review", "dob_unavailable");
    return;
  }
  const age = calculateAge(dob);
  await updateStripeVerification(session, age >= 18 ? "verified" : "failed", age >= 18 ? "age_over_18_confirmed" : "age_under_18");
}

export async function stripeVerificationWebhookHandler(req: Request, res: Response) {
  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(req.body as Buffer, req.header("stripe-signature"));
  } catch {
    return res.status(400).json({ error: { message: "Invalid Stripe webhook signature" } });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[api] Stripe verification webhook received", { eventType: event.type });
  }

  const session = event.data.object as Stripe.Identity.VerificationSession;
  if (event.type === "identity.verification_session.verified") {
    await handleStripeVerified(session);
  } else if (event.type === "identity.verification_session.requires_input") {
    await updateStripeVerification(session, "failed", "stripe_requires_input");
  } else if (event.type === "identity.verification_session.canceled") {
    await updateStripeVerification(session, "expired", "stripe_canceled");
  }

  return res.json({ received: true });
}
