import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter = Router();

profileRouter.get("/private", requireAuth, async (req, res) => {
  const [verification, results] = await Promise.all([
    prisma.verificationStatus.findFirst({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } }),
    prisma.analysisResult.findMany({
      where: { userId: req.user!.id, deletedAt: null },
      include: { upload: { select: { id: true, originalFilename: true, status: true, createdAt: true } } },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const scores = results.map((result) => result.totalScore);
  const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const bestScore = scores.length ? Math.max(...scores) : null;

  return res.json({
    profile: {
      username: req.user!.username,
      verificationStatus: verification?.status ?? "pending",
      privateAnalysisCount: results.length,
      averagePrivateScore: averageScore,
      bestPrivateScore: bestScore,
      savedPrivateResults: results
    }
  });
});
