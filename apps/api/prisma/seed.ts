import {
  PrismaClient,
  Role,
  BadgeLevel,
  Visibility,
  SubscriptionStatus,
  PurchaseStatus,
  ModerationStatus,
  AnalyzerJobStatus
} from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  // Clear dev data deterministically (safe for local MVP).
  await prisma.analyzerResult.deleteMany();
  await prisma.analyzerJob.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.tip.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatThread.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.media.deleteMany();
  await prisma.post.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.creatorCategory.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.creatorProfile.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const adminId = uuid();
  const creatorId = uuid();
  const fanId = uuid();

  const admin = await prisma.user.create({
    data: {
      id: adminId,
      email: "admin@sizeai.local",
      handle: "admin",
      role: Role.ADMIN,
      ageVerifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45),
      consentedAt: new Date()
    }
  });

  const creator = await prisma.user.create({
    data: {
      id: creatorId,
      email: "creator@sizeai.local",
      handle: "compact-king",
      role: Role.CREATOR,
      ageVerifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
    }
  });

  const fan = await prisma.user.create({
    data: {
      id: fanId,
      email: "fan@sizeai.local",
      handle: "fanboy",
      role: Role.FAN,
      ageVerifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
      consentedAt: new Date()
    }
  });

  await prisma.creatorProfile.create({
    data: {
      userId: creatorId,
      bio: "Low-key geometry enjoyer. High-key vibes.",
      badgeLevel: BadgeLevel.VERIFIED,
      subscriptionPriceCents: 9900,
      stripeConnectAccountId: "acct_seed_123",
      payoutEnabled: true,
      verifiedAt: new Date()
    }
  });

  const categories = await prisma.category.createMany({
    data: [
      { name: "Engineered Auras", slug: "engineered" },
      { name: "Balanced Geometry", slug: "balanced-geometry" },
      { name: "Compact Kings", slug: "compact-kings" }
    ],
    skipDuplicates: true
  });

  // Prisma createMany doesn't return created rows reliably; fetch.
  const catRows = await prisma.category.findMany();
  const catBySlug = Object.fromEntries(catRows.map((c) => [c.slug, c]));

  await prisma.creatorCategory.createMany({
    data: [
      { creatorId, categoryId: catBySlug["engineered"].id },
      { creatorId, categoryId: catBySlug["balanced-geometry"].id },
      { creatorId, categoryId: catBySlug["compact-kings"].id }
    ]
  });

  await prisma.follow.create({
    data: {
      followerId: fanId,
      creatorId: creatorId
    }
  });

  const subscription = await prisma.subscription.create({
    data: {
      fanId,
      creatorId,
      stripeSubscriptionId: "sub_seed_123",
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25)
    }
  });

  const postPublic = await prisma.post.create({
    data: {
      creatorId,
      text: "A tasteful preview for subscribed vibes only.",
      visibility: Visibility.SUBSCRIBERS
    }
  });

  const postPpv = await prisma.post.create({
    data: {
      creatorId,
      text: "Locked PPV drop. Bring the consent energy.",
      visibility: Visibility.PPV,
      ppvPriceCents: 1499
    }
  });

  const media1 = await prisma.media.create({
    data: {
      ownerId: creatorId,
      postId: postPublic.id,
      r2Key: `seed/${creatorId}/posts/${postPublic.id}/preview.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 123456,
      width: 1024,
      height: 768,
      durationSec: null,
      hash: "seed_hash_1",
      isAdult: true,
      moderationStatus: ModerationStatus.APPROVED
    }
  });

  const media2 = await prisma.media.create({
    data: {
      ownerId: creatorId,
      postId: postPpv.id,
      r2Key: `seed/${creatorId}/posts/${postPpv.id}/ppv_drop.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 234567,
      width: 1024,
      height: 768,
      durationSec: null,
      hash: "seed_hash_2",
      isAdult: true,
      moderationStatus: ModerationStatus.APPROVED
    }
  });

  await prisma.like.create({
    data: {
      postId: postPublic.id,
      userId: fanId
    }
  });

  await prisma.comment.create({
    data: {
      postId: postPublic.id,
      userId: fanId,
      text: "This is engineered in the best way."
    }
  });

  const thread = await prisma.chatThread.create({
    data: {
      creatorId,
      fanId
    }
  });

  const msg1 = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderId: fanId,
      recipientId: creatorId,
      body: "Hey! Your vibes are immaculate."
    }
  });

  const msg2 = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderId: creatorId,
      recipientId: fanId,
      body: "Want the locked reply? It has premium geometry.",
      ppvUnlockPriceCents: 499,
      attachmentMediaId: media2.id
    }
  });

  await prisma.purchase.create({
    data: {
      buyerId: fanId,
      sellerId: creatorId,
      postId: null,
      chatMessageId: msg2.id,
      stripePaymentIntentId: "pi_seed_456",
      amountCents: 499,
      status: PurchaseStatus.SUCCEEDED
    }
  });

  const analyzerJob = await prisma.analyzerJob.create({
    data: {
      userId: fanId,
      mediaId: media1.id,
      status: AnalyzerJobStatus.COMPLETED,
      consentedAt: new Date(),
      autoDeleteAfterProcessing: true,
      settings: { autoDeleteAfterProcessing: true }
    }
  });

  await prisma.analyzerResult.create({
    data: {
      jobId: analyzerJob.id,
      overallScore: 78,
      percentile: 87,
      label: "Balanced Build",
      confidence: 0.74,
      radar: {
        Length: 72,
        Girth: 80,
        Symmetry: 69,
        "Skin clarity": 61,
        Presentation: 83,
        "Photo quality": 76
      },
      feedback: {
        humor: "The geometry looks surprisingly coherent. Entertainment only!",
        confidence: "Confidence: 74%. The input was readable and not overly noisy."
      },
      aiSummary: "Overall: 78/100. Label: Balanced Build. Confidence-oriented, not medical."
    }
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete:", { admin: admin.handle, creator: creator.handle, fan: fan.handle, subscription });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

