import Stripe from "stripe";
import { z } from "zod";

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1)
});

let cached: { stripe: Stripe; webhookSecret: string } | null = null;

export function getStripe() {
  if (cached) return cached;
  const env = envSchema.parse(process.env);
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    typescript: true
  });
  cached = { stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
  return cached;
}

