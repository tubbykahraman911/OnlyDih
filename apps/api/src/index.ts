import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { z } from "zod";
import { authRouter } from "./routes/auth.js";
import { verificationRouter } from "./routes/verification.js";
import { uploadsRouter } from "./routes/uploads.js";
import { analysisRouter } from "./routes/analysis.js";
import { profileRouter } from "./routes/profile.js";
import { privacyRouter } from "./routes/privacy.js";
import { safetyRouter } from "./routes/safety.js";
import { healthRouter } from "./routes/health.js";
import { requireAuth, requireCsrf } from "./middleware/auth.js";
import { deleteExpiredRawUploads, startAnalysisWorker } from "./lib/analysisQueue.js";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(24).default("dev-session-secret-change-before-production")
});

const env = envSchema.parse(process.env);
const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", env.APP_BASE_URL],
        frameAncestors: ["'none'"]
      }
    }
  })
);
app.use(
  cors({
    origin: env.APP_BASE_URL,
    credentials: true
  })
);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, phase: "phase_1_private_only" }));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/uploads", requireAuth, requireCsrf, uploadsRouter);
app.use("/api/analysis", requireAuth, requireCsrf, analysisRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/privacy", requireAuth, requireCsrf, privacyRouter);
app.use("/api/safety", requireAuth, requireCsrf, safetyRouter);

app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = process.env.NODE_ENV === "production" ? "Request failed" : "Request failed";
  return res.status(500).json({ error: { message } });
});

app.use((_req, res) => res.status(404).json({ error: { message: "Not found" } }));

startAnalysisWorker();
setInterval(() => void deleteExpiredRawUploads(), 1000 * 60 * 60).unref();

app.listen(env.PORT, () => {
  console.log(`[api] OnlyDihs private Phase 1 API listening on :${env.PORT}`);
});
