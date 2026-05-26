import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { z } from "zod";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { ageRouter } from "./routes/age.js";
import { uploadsRouter } from "./routes/uploads.js";
import { mediaRouter } from "./routes/media.js";
import { stripeRouter, stripeWebhookHandler } from "./routes/stripe.js";
import { socialRouter } from "./routes/social.js";
import { chatRouter } from "./routes/chat.js";
import { analyzerRouter } from "./routes/analyzer.js";
import { moderationRouter } from "./routes/moderation.js";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  SUPABASE_URL: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  AI_SERVICE_URL: z.string().min(1).optional()
});

type Env = z.infer<typeof envSchema>;
const env: Env = envSchema.parse(process.env);

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(morgan("tiny"));

// Stripe webhooks require the RAW body to validate the signature.
app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/health", healthRouter);
app.use("/me", meRouter);
app.use("/age", ageRouter);
app.use("/uploads", uploadsRouter);
app.use("/media", mediaRouter);
app.use("/stripe", stripeRouter);
app.use("/", socialRouter);
app.use("/chats", chatRouter);
app.use("/analyzer", analyzerRouter);
app.use("/", moderationRouter);

app.use((_req, res) => res.status(404).json({ error: { message: "Not found" } }));

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${env.PORT}`);
});

