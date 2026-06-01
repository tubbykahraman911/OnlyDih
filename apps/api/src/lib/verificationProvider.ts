import Stripe from "stripe";
import { randomToken } from "./crypto.js";

export type VerificationProviderSession = {
  provider: "placeholder" | "stripe";
  providerVerificationId: string;
  verificationUrl: string;
};

export function activeVerificationProvider() {
  if (process.env.VERIFICATION_PROVIDER === "stripe") return "stripe";
  if (process.env.VERIFICATION_PROVIDER && process.env.VERIFICATION_PROVIDER !== "placeholder") {
    throw new Error(`Unsupported VERIFICATION_PROVIDER: ${process.env.VERIFICATION_PROVIDER}`);
  }
  return "placeholder";
}

function envValue(key: string) {
  return process.env[key]?.trim();
}

export function validateVerificationProviderConfig() {
  if (process.env.VERIFICATION_PROVIDER === "stripe") {
    const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((key) => !envValue(key));
    if (missing.length) {
      throw new Error(
        `VERIFICATION_PROVIDER=stripe requires ${missing.join(", ")}. Add them to apps/api/.env or use VERIFICATION_PROVIDER=placeholder for local placeholder verification.`
      );
    }
  }
}

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secretKey = envValue("STRIPE_SECRET_KEY");
  if (!secretKey) return null;
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export function verificationProviderDebugInfo() {
  return {
    provider: activeVerificationProvider(),
    stripeSecretKeyPresent: Boolean(envValue("STRIPE_SECRET_KEY")),
    stripeWebhookSecretPresent: Boolean(envValue("STRIPE_WEBHOOK_SECRET")),
    stripeIdentityReturnUrlPresent: Boolean(envValue("STRIPE_IDENTITY_RETURN_URL")),
    placeholderWebhookSecretPresent: Boolean(envValue("VERIFICATION_WEBHOOK_SECRET"))
  };
}

export async function startPlaceholderVerification(userId: string): Promise<VerificationProviderSession> {
  const providerVerificationId = `placeholder_${randomToken(18)}`;
  return {
    provider: "placeholder",
    providerVerificationId,
    verificationUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verification?session=${providerVerificationId}&user=${userId}`
  };
}

export async function startStripeVerification(user: { id: string; email?: string }): Promise<VerificationProviderSession> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is required when VERIFICATION_PROVIDER=stripe.");
  const returnUrl = envValue("STRIPE_IDENTITY_RETURN_URL") ?? `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verification`;
  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    client_reference_id: user.id,
    metadata: { userId: user.id },
    provided_details: user.email ? { email: user.email } : undefined,
    return_url: returnUrl
  });
  if (!session.url) throw new Error("Stripe verification session did not include a redirect URL.");
  return {
    provider: "stripe",
    providerVerificationId: session.id,
    verificationUrl: session.url
  };
}

export async function startVerificationSession(user: { id: string; email?: string }) {
  if (activeVerificationProvider() === "stripe") return startStripeVerification(user);
  return startPlaceholderVerification(user.id);
}

export function verifyWebhookSignature(signature: string | undefined, bodySecret: string | undefined) {
  if (!process.env.VERIFICATION_WEBHOOK_SECRET) return true;
  return Boolean(signature && bodySecret && signature === process.env.VERIFICATION_WEBHOOK_SECRET);
}

export function calculateAge(dob: { year: number; month: number; day: number }, today = new Date()) {
  let age = today.getUTCFullYear() - dob.year;
  const monthDelta = today.getUTCMonth() + 1 - dob.month;
  const dayDelta = today.getUTCDate() - dob.day;
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) age -= 1;
  return age;
}

export function constructStripeWebhookEvent(body: Buffer, signature: string | undefined) {
  const stripe = getStripeClient();
  const webhookSecret = envValue("STRIPE_WEBHOOK_SECRET");
  if (!stripe || !webhookSecret || !signature) throw new Error("Stripe webhook is not configured.");
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}
