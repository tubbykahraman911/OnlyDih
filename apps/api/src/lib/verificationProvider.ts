import { randomToken } from "./crypto.js";

export async function startPlaceholderVerification(userId: string) {
  const providerVerificationId = `placeholder_${randomToken(18)}`;
  return {
    provider: "placeholder",
    providerVerificationId,
    verificationUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verification?session=${providerVerificationId}&user=${userId}`
  };
}

export function verifyWebhookSignature(signature: string | undefined, bodySecret: string | undefined) {
  if (!process.env.VERIFICATION_WEBHOOK_SECRET) return true;
  return Boolean(signature && bodySecret && signature === process.env.VERIFICATION_WEBHOOK_SECRET);
}
