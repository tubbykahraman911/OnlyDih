import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { creatorProfile: true }
  });

  if (!user) return res.status(404).json({ error: { message: "Not found" } });

  const response = z
    .object({
      id: z.string().uuid(),
      email: z.string().email().optional().nullable(),
      handle: z.string().optional().nullable(),
      role: z.enum(["FAN", "CREATOR", "ADMIN"]),
      isBanned: z.boolean(),
      ageVerifiedAt: z.coerce.date().nullable(),
      consentedAt: z.coerce.date().nullable(),
      creatorProfile: z
        .object({
          bio: z.string().optional().nullable(),
          badgeLevel: z.string(),
          subscriptionPriceCents: z.number(),
          payoutEnabled: z.boolean(),
          verifiedAt: z.coerce.date().nullable(),
          stripeConnectAccountId: z.string().optional().nullable()
        })
        .optional()
        .nullable()
    })
    .parse({
      id: user.id,
      email: user.email,
      handle: user.handle,
      role: user.role as "FAN" | "CREATOR" | "ADMIN",
      isBanned: user.isBanned,
      ageVerifiedAt: user.ageVerifiedAt,
      consentedAt: user.consentedAt,
      creatorProfile: user.creatorProfile
        ? {
            bio: user.creatorProfile.bio,
            badgeLevel: user.creatorProfile.badgeLevel,
            subscriptionPriceCents: user.creatorProfile.subscriptionPriceCents,
            payoutEnabled: user.creatorProfile.payoutEnabled,
            verifiedAt: user.creatorProfile.verifiedAt,
            stripeConnectAccountId: user.creatorProfile.stripeConnectAccountId
          }
        : null
    });

  res.json(response);
});

