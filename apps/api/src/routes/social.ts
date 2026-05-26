import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { signGetObject } from "../lib/r2.js";
import { ModerationStatus, NotificationType, PurchaseStatus, SubscriptionStatus, Visibility } from "@prisma/client";

const socialRouter = Router();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});

function getTodayISO() {
  return new Date().toISOString();
}

socialRouter.get("/feed", requireAuth, async (req, res) => {
  const query = feedQuerySchema.parse(req.query);
  const limit = query.limit ?? 20;
  const viewerId = req.user!.id;

  const blocked = await prisma.block.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true }
  });
  const blockedSet = new Set(blocked.map((b) => b.blockedId));

  // Fetch candidate posts; permission filtering is applied after.
  const posts = await prisma.post.findMany({
    where: {
      OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }]
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      creator: {
        select: { id: true, handle: true, creatorProfile: { select: { badgeLevel: true } } }
      },
      media: {
        where: { moderationStatus: ModerationStatus.APPROVED },
        take: 5
      }
    }
  });

  // Filter based on visibility rules.
  const allowedPosts: typeof posts = [];
  for (const p of posts) {
    if (blockedSet.has(p.creatorId)) continue;
    if (p.visibility === Visibility.PUBLIC) {
      allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.SUBSCRIBERS || p.visibility === Visibility.STORY || p.visibility === Visibility.HIGHLIGHT) {
      const sub = await prisma.subscription.findFirst({
        where: {
          fanId: viewerId,
          creatorId: p.creatorId,
          status: SubscriptionStatus.ACTIVE
        }
      });
      if (sub) allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.PPV) {
      if (!p.ppvPriceCents) continue;
      const purchase = await prisma.purchase.findFirst({
        where: {
          buyerId: viewerId,
          sellerId: p.creatorId,
          postId: p.id,
          status: PurchaseStatus.SUCCEEDED
        }
      });
      if (purchase) allowedPosts.push(p);
      continue;
    }
  }

  const postIds = allowedPosts.map((p) => p.id);

  const likes = await prisma.like.findMany({
    where: {
      userId: viewerId,
      postId: { in: postIds }
    },
    select: { postId: true }
  });
  const likeSet = new Set(likes.map((l) => l.postId));

  const items = await Promise.all(
    allowedPosts.map(async (p) => {
      const media = await Promise.all(
        p.media.map(async (m) => {
          const signed = await signGetObject({ key: m.r2Key, expiresInSeconds: 120 });
          return { id: m.id, mimeType: m.mimeType, signedGetUrl: signed.signedUrl };
        })
      );
      return {
        id: p.id,
        creatorId: p.creatorId,
        creator: { handle: p.creator.handle, badgeLevel: p.creator.creatorProfile?.badgeLevel ?? null },
        text: p.text,
        visibility: p.visibility,
        ppvPriceCents: p.ppvPriceCents,
        createdAt: p.createdAt,
        likesCount: p.likesCount,
        likedByViewer: likeSet.has(p.id),
        media
      };
    })
  );

  res.json({ items, generatedAt: getTodayISO() });
});

socialRouter.get("/trending", requireAuth, async (req, res) => {
  const viewerId = req.user!.id;
  const limit = z.coerce.number().int().min(1).max(50).parse(req.query.limit ?? "12");

  const blocked = await prisma.block.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true }
  });
  const blockedSet = new Set(blocked.map((b) => b.blockedId));

  // MVP: trending = highest likesCount in last N posts. Filtering is delegated to feed logic later.
  const posts = await prisma.post.findMany({
    where: { OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
    orderBy: [{ likesCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      creator: { select: { id: true, handle: true, creatorProfile: { select: { badgeLevel: true } } } },
      media: { where: { moderationStatus: ModerationStatus.APPROVED }, take: 3 }
    }
  });

  const allowedPosts: typeof posts = [];
  for (const p of posts) {
    if (blockedSet.has(p.creatorId)) continue;
    if (p.visibility === Visibility.PUBLIC) {
      allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.SUBSCRIBERS || p.visibility === Visibility.STORY || p.visibility === Visibility.HIGHLIGHT) {
      const sub = await prisma.subscription.findFirst({
        where: { fanId: viewerId, creatorId: p.creatorId, status: SubscriptionStatus.ACTIVE }
      });
      if (sub) allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.PPV) {
      const purchase = await prisma.purchase.findFirst({
        where: { buyerId: viewerId, sellerId: p.creatorId, postId: p.id, status: PurchaseStatus.SUCCEEDED }
      });
      if (purchase) allowedPosts.push(p);
      continue;
    }
  }

  res.json({
    items: allowedPosts.map((p) => ({
      id: p.id,
      creatorId: p.creatorId,
      text: p.text,
      visibility: p.visibility,
      createdAt: p.createdAt
    }))
  });
});

socialRouter.get("/creators/search", requireAuth, async (req, res) => {
  const q = z.string().min(1).max(50).parse(String(req.query.q ?? ""));
  const creators = await prisma.user.findMany({
    where: {
      role: "CREATOR",
      handle: { contains: q, mode: "insensitive" }
    },
    take: 10,
    select: {
      id: true,
      handle: true,
      creatorProfile: { select: { badgeLevel: true, subscriptionPriceCents: true } }
    }
  });
  res.json({ items: creators });
});

socialRouter.get("/creators/:handle", requireAuth, async (req, res) => {
  const handle = z.string().min(1).parse(req.params.handle);
  const viewerId = req.user!.id;

  const creator = await prisma.user.findUnique({
    where: { handle },
    include: {
      creatorProfile: true,
      creatorPosts: {
        where: { OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          media: { where: { moderationStatus: ModerationStatus.APPROVED }, take: 5 },
          likes: { where: { userId: viewerId } }
        }
      }
    }
  });

  if (!creator || creator.role !== "CREATOR") return res.status(404).json({ error: { message: "Not found" } });
  const blocked = await prisma.block.findFirst({ where: { blockerId: viewerId, blockedId: creator.id } });
  if (blocked) return res.status(403).json({ error: { message: "Forbidden" } });

  // Determine follow/subscription.
  const [follow, subscription] = await Promise.all([
    prisma.follow.findFirst({ where: { followerId: viewerId, creatorId: creator.id } }),
    prisma.subscription.findFirst({ where: { fanId: viewerId, creatorId: creator.id, status: SubscriptionStatus.ACTIVE } })
  ]);

  // Permission-filter creator posts.
  const posts = [];
  for (const p of creator.creatorPosts) {
    if (p.visibility === Visibility.PUBLIC) posts.push(p);
    else if (p.visibility === Visibility.SUBSCRIBERS || p.visibility === Visibility.STORY || p.visibility === Visibility.HIGHLIGHT) {
      if (subscription) posts.push(p);
    } else if (p.visibility === Visibility.PPV) {
      if (!p.ppvPriceCents) continue;
      const purchase = await prisma.purchase.findFirst({
        where: { buyerId: viewerId, sellerId: creator.id, postId: p.id, status: PurchaseStatus.SUCCEEDED }
      });
      if (purchase) posts.push(p);
    }
  }

  const items = await Promise.all(
    posts.map(async (p) => {
      const media = await Promise.all(
        p.media.map(async (m) => {
          const signed = await signGetObject({ key: m.r2Key, expiresInSeconds: 120 });
          return { id: m.id, mimeType: m.mimeType, signedGetUrl: signed.signedUrl };
        })
      );
      return {
        id: p.id,
        text: p.text,
        visibility: p.visibility,
        ppvPriceCents: p.ppvPriceCents,
        likesCount: p.likesCount,
        likedByViewer: p.likes.length > 0,
        media
      };
    })
  );

  res.json({
    creator: {
      id: creator.id,
      handle: creator.handle,
      bio: creator.creatorProfile?.bio ?? null,
      badgeLevel: creator.creatorProfile?.badgeLevel ?? null,
      subscriptionPriceCents: creator.creatorProfile?.subscriptionPriceCents ?? 0,
      payoutEnabled: creator.creatorProfile?.payoutEnabled ?? true
    },
    viewer: {
      isFollowing: !!follow,
      isSubscribed: !!subscription
    },
    posts: items
  });
});

socialRouter.post("/creators/:creatorId/follow", requireAuth, async (req, res) => {
  const body = z.object({}).parse(req.body);
  void body;
  const creatorId = z.string().uuid().parse(req.params.creatorId);
  const followerId = req.user!.id;

  // Prevent self-follow
  if (creatorId === followerId) return res.status(400).json({ error: { message: "Cannot follow yourself" } });

  const exists = await prisma.follow.findFirst({ where: { followerId, creatorId } });
  if (exists) return res.json({ ok: true, following: true });

  await prisma.follow.create({ data: { followerId, creatorId } });

  await prisma.notification.create({
    data: {
      userId: creatorId,
      type: NotificationType.SYSTEM,
      payload: { type: "FOLLOW", followerId },
      readAt: null
    }
  });

  res.json({ ok: true, following: true });
});

socialRouter.post("/posts/:postId/like", requireAuth, async (req, res) => {
  const postId = z.string().parse(req.params.postId);
  const userId = req.user!.id;

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { creatorId: true } });
  if (!post) return res.status(404).json({ error: { message: "Not found" } });

  const existing = await prisma.like.findUnique({
    where: { postId_userId: { postId, userId } }
  });

  if (existing) {
    await prisma.like.delete({ where: { postId_userId: { postId, userId } } });
    await prisma.post.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } } });
    return res.json({ ok: true, liked: false });
  }

  await prisma.like.create({ data: { postId, userId } });
  await prisma.post.update({ where: { id: postId }, data: { likesCount: { increment: 1 } } });

  await prisma.notification.create({
    data: {
      userId: post.creatorId,
      type: NotificationType.LIKE,
      payload: { type: "LIKE", postId, likedBy: userId },
      readAt: null
    }
  });

  res.json({ ok: true, liked: true });
});

socialRouter.post("/posts/:postId/comment", requireAuth, async (req, res) => {
  const postId = z.string().parse(req.params.postId);
  const body = z.object({ text: z.string().min(1).max(500) }).parse(req.body);
  const userId = req.user!.id;

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { creatorId: true } });
  if (!post) return res.status(404).json({ error: { message: "Not found" } });

  const comment = await prisma.comment.create({
    data: {
      postId,
      userId,
      text: body.text
    }
  });

  await prisma.notification.create({
    data: {
      userId: post.creatorId,
      type: NotificationType.COMMENT,
      payload: { type: "COMMENT", postId, commentId: comment.id, from: userId },
      readAt: null
    }
  });

  res.json({ ok: true, commentId: comment.id });
});

socialRouter.get("/notifications", requireAuth, async (req, res) => {
  const viewerId = req.user!.id;
  const items = await prisma.notification.findMany({
    where: { userId: viewerId },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  res.json({ items });
});

socialRouter.get("/recommendations", requireAuth, async (req, res) => {
  const viewerId = req.user!.id;
  const limit = z.coerce.number().int().min(1).max(30).parse(req.query.limit ?? "12");

  const blocked = await prisma.block.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true }
  });
  const blockedSet = new Set(blocked.map((b) => b.blockedId));

  const followed = await prisma.follow.findMany({
    where: { followerId: viewerId },
    select: { creatorId: true }
  });
  const followedIds = followed.map((f) => f.creatorId);

  const baseWhere = {
    OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }]
  } as any;

  if (followedIds.length) baseWhere.creatorId = { in: followedIds };

  const candidates = await prisma.post.findMany({
    where: baseWhere,
    orderBy: [{ likesCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      creator: { select: { id: true, handle: true, creatorProfile: { select: { badgeLevel: true } } } },
      media: { where: { moderationStatus: ModerationStatus.APPROVED }, take: 5 }
    }
  });

  // Permission filter is shared with feed logic.
  const allowedPosts: typeof candidates = [];
  for (const p of candidates) {
    if (blockedSet.has(p.creatorId)) continue;
    if (p.visibility === Visibility.PUBLIC) {
      allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.SUBSCRIBERS || p.visibility === Visibility.STORY || p.visibility === Visibility.HIGHLIGHT) {
      const sub = await prisma.subscription.findFirst({
        where: { fanId: viewerId, creatorId: p.creatorId, status: SubscriptionStatus.ACTIVE }
      });
      if (sub) allowedPosts.push(p);
      continue;
    }
    if (p.visibility === Visibility.PPV) {
      const purchase = await prisma.purchase.findFirst({
        where: { buyerId: viewerId, sellerId: p.creatorId, postId: p.id, status: PurchaseStatus.SUCCEEDED }
      });
      if (purchase) allowedPosts.push(p);
      continue;
    }
  }

  res.json({
    items: allowedPosts.map((p) => ({
      id: p.id,
      creatorId: p.creatorId,
      text: p.text,
      visibility: p.visibility,
      createdAt: p.createdAt
    }))
  });
});

export { socialRouter };

