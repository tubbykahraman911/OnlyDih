import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getStripe } from "../lib/stripe.js";
import { Stripe } from "stripe";
import { PurchaseStatus, SubscriptionStatus, TipStatus } from "@prisma/client";

const stripeRouter = Router();

const connectOnboardSchema = z.object({
  refreshUrl: z.string().url().optional(),
  returnUrl: z.string().url().optional()
});

stripeRouter.post("/connect/onboard", requireAuth, async (req, res) => {
  if (!req.user || (req.user.role !== "CREATOR" && req.user.role !== "ADMIN")) {
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  const body = connectOnboardSchema.parse(req.body);
  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: req.user!.id }
  });
  if (!creatorProfile) {
    return res.status(400).json({ error: { message: "Creator profile missing" } });
  }

  const { stripe, webhookSecret } = getStripe();
  const accountId = creatorProfile.stripeConnectAccountId;

  let connectedAccountId = accountId;
  if (!connectedAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        transfers: { requested: true }
      }
    });
    connectedAccountId = account.id;

    await prisma.creatorProfile.update({
      where: { userId: req.user!.id },
      data: { stripeConnectAccountId: connectedAccountId }
    });
  }

  const refreshUrl = body.refreshUrl ?? process.env.STRIPE_ONBOARD_REFRESH_URL ?? undefined;
  const returnUrl = body.returnUrl ?? process.env.STRIPE_ONBOARD_RETURN_URL ?? undefined;
  if (!refreshUrl || !returnUrl) {
    return res.status(400).json({ error: { message: "Missing onboarding redirect URLs" } });
  }

  const accountLink = await stripe.accountLinks.create({
    account: connectedAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"
  });

  void webhookSecret; // kept for future connect-specific webhooks

  res.json({ onboardingUrl: accountLink.url });
});

const subscriptionCreateSchema = z.object({
  creatorId: z.string().uuid(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

stripeRouter.post("/subscriptions/create", requireAuth, async (req, res) => {
  const body = subscriptionCreateSchema.parse(req.body);
  const fanId = req.user!.id;

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: body.creatorId }
  });
  if (!creatorProfile) return res.status(404).json({ error: { message: "Creator not found" } });
  if (!creatorProfile.stripeConnectAccountId) {
    return res.status(400).json({ error: { message: "Creator not onboarded for payouts" } });
  }

  const { stripe } = getStripe();

  const successUrl =
    body.successUrl ?? process.env.STRIPE_SUBS_SUCCESS_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const cancelUrl =
    body.cancelUrl ?? process.env.STRIPE_SUBS_CANCEL_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: { message: "Missing success/cancel URLs" } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: (await prisma.user.findUnique({ where: { id: fanId } }))?.email ?? undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: creatorProfile.subscriptionPriceCents,
          recurring: { interval: "month" },
          product_data: {
            name: `SizeAI subscription`
          }
        },
        quantity: 1
      }
    ],
    subscription_data: {
      transfer_data: {
        destination: creatorProfile.stripeConnectAccountId
      },
      metadata: {
        sizeai_fanId: fanId,
        sizeai_creatorId: body.creatorId,
        sizeai_type: "creator_subscription"
      }
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      sizeai_fanId: fanId,
      sizeai_creatorId: body.creatorId,
      sizeai_type: "creator_subscription"
    }
  });

  if (!checkoutSession.url) return res.status(500).json({ error: { message: "No checkout URL" } });
  res.json({ checkoutUrl: checkoutSession.url });
});

const tipCreateSchema = z.object({
  creatorId: z.string().uuid(),
  amountCents: z.number().int().positive()
});

stripeRouter.post("/tips/create-intent", requireAuth, async (req, res) => {
  const body = tipCreateSchema.parse(req.body);
  const buyerId = req.user!.id;

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: body.creatorId }
  });
  if (!creatorProfile || !creatorProfile.stripeConnectAccountId) {
    return res.status(400).json({ error: { message: "Creator payouts not available" } });
  }

  const { stripe } = getStripe();

  const pi = await stripe.paymentIntents.create({
    amount: body.amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      sizeai_type: "tip",
      sizeai_buyerId: buyerId,
      sizeai_creatorId: body.creatorId
    },
    transfer_data: {
      destination: creatorProfile.stripeConnectAccountId
    }
  });

  // Create pending ledger row for reconciliation
  await prisma.tip.create({
    data: {
      buyerId,
      sellerId: body.creatorId,
      amountCents: body.amountCents,
      stripePaymentIntentId: pi.id,
      status: TipStatus.PENDING
    }
  });

  res.json({ clientSecret: pi.client_secret });
});

const ppvCreateSchema = z.object({
  postId: z.string().uuid().optional(),
  chatMessageId: z.string().optional(),
  amountCents: z.number().int().positive().optional()
});

stripeRouter.post("/ppv/create-intent", requireAuth, async (req, res) => {
  const body = ppvCreateSchema.parse(req.body);
  const buyerId = req.user!.id;

  if (!body.postId && !body.chatMessageId) {
    return res.status(400).json({ error: { message: "postId or chatMessageId required" } });
  }

  const { stripe } = getStripe();

  // Determine seller/amount
  let sellerId: string;
  let amountCents: number;

  if (body.postId) {
    const post = await prisma.post.findUnique({ where: { id: body.postId } });
    if (!post) return res.status(404).json({ error: { message: "Post not found" } });
    if (post.visibility !== "PPV" || !post.ppvPriceCents) {
      return res.status(400).json({ error: { message: "Post is not PPV" } });
    }
    sellerId = post.creatorId;
    amountCents = body.amountCents ?? post.ppvPriceCents;
  } else {
    const msgWithThread = await prisma.chatMessage.findUnique({
      where: { id: body.chatMessageId },
      include: { thread: true }
    });
    if (!msgWithThread) return res.status(404).json({ error: { message: "Message not found" } });
    if (!msgWithThread.ppvUnlockPriceCents) {
      return res.status(400).json({ error: { message: "Message not unlockable" } });
    }
    sellerId = msgWithThread.thread.creatorId;
    amountCents = body.amountCents ?? msgWithThread.ppvUnlockPriceCents;
  }

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: sellerId }
  });
  if (!creatorProfile || !creatorProfile.stripeConnectAccountId) {
    return res.status(400).json({ error: { message: "Creator payouts not available" } });
  }

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      sizeai_type: "ppv",
      sizeai_buyerId: buyerId,
      sizeai_sellerId: sellerId,
      sizeai_postId: body.postId ?? "",
      sizeai_chatMessageId: body.chatMessageId ?? ""
    },
    transfer_data: {
      destination: creatorProfile.stripeConnectAccountId
    }
  });

  await prisma.purchase.create({
    data: {
      buyerId,
      sellerId,
      postId: body.postId ?? null,
      chatMessageId: body.chatMessageId ?? null,
      stripePaymentIntentId: pi.id,
      amountCents,
      status: PurchaseStatus.PENDING
    }
  });

  res.json({ clientSecret: pi.client_secret });
});

// Webhook handler is mounted separately in `apps/api/src/index.ts` with `express.raw`.
export async function stripeWebhookHandler(req: any, res: any) {
  const sig = req.headers["stripe-signature"];
  const rawBody = req.body;
  if (!sig || !rawBody) return res.status(400).send("Bad request");

  const { stripe, webhookSecret } = getStripe();

  const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

  try {
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const fanId = sub.metadata["sizeai_fanId"];
        const creatorId = sub.metadata["sizeai_creatorId"];
        if (!fanId || !creatorId) break;

        const status =
          sub.status === "active"
            ? SubscriptionStatus.ACTIVE
            : sub.status === "past_due"
              ? SubscriptionStatus.PAST_DUE
              : SubscriptionStatus.INCOMPLETE;

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: sub.id },
          update: {
            fanId,
            creatorId,
            status,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
          },
          create: {
            fanId,
            creatorId,
            stripeSubscriptionId: sub.id,
            status,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
          }
        });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        if (!sub.metadata) break;
        const fanId = sub.metadata["sizeai_fanId"];
        const creatorId = sub.metadata["sizeai_creatorId"];
        if (!fanId || !creatorId) break;

        const status =
          sub.status === "active"
            ? SubscriptionStatus.ACTIVE
            : sub.status === "past_due"
              ? SubscriptionStatus.PAST_DUE
              : SubscriptionStatus.INCOMPLETE;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            fanId,
            creatorId,
            status,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
          }
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: SubscriptionStatus.CANCELED }
        });
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const type = pi.metadata["sizeai_type"];

        if (type === "tip") {
          await prisma.tip.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: { status: TipStatus.SUCCEEDED }
          });
        } else if (type === "ppv") {
          await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: { status: PurchaseStatus.SUCCEEDED }
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[stripe webhook] handler error:", e);
  }

  res.json({ received: true });
}

export { stripeRouter };

