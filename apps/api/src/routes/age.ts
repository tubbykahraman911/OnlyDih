import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const ageRouter = Router();

const verifySchema = z.object({
  confirmed: z.boolean()
});

ageRouter.post("/verify", requireAuth, async (req, res) => {
  const body = verifySchema.parse(req.body);
  if (!body.confirmed) {
    return res.status(400).json({ error: { message: "Confirmation required" } });
  }

  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ageVerifiedAt: new Date()
    }
  });

  res.json({ ok: true });
});

ageRouter.post("/consent/ack", requireAuth, async (req, res) => {
  const body = verifySchema.parse(req.body);
  if (!body.confirmed) {
    return res.status(400).json({ error: { message: "Consent confirmation required" } });
  }

  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      consentedAt: new Date()
    }
  });

  res.json({ ok: true });
});

