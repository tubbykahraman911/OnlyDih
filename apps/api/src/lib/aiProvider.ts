export function validateAiProviderConfig() {
  if (process.env.AI_PROVIDER !== "xai") return;
  if (process.env.XAI_API_KEY) return;
  if (process.env.NODE_ENV === "production") {
    throw new Error('AI_PROVIDER="xai" requires XAI_API_KEY in production.');
  }
}

export function aiProviderDebugInfo() {
  return {
    provider: process.env.AI_PROVIDER || "placeholder",
    xaiConfigured: Boolean(process.env.XAI_API_KEY),
    model: process.env.XAI_MODEL || "grok-4.3",
    fallback: process.env.AI_PROVIDER === "xai" && !process.env.XAI_API_KEY ? "placeholder" : "none"
  };
}
