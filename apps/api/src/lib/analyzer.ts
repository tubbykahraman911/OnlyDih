import { z } from "zod";
import type { Upload } from "@prisma/client";
import { readPrivateObject } from "./storage.js";

const analyzerOutputSchema = z.object({
  length_score: z.number().int().min(0).max(100),
  girth_score: z.number().int().min(0).max(100),
  skin_clarity_score: z.number().int().min(0).max(100),
  presentation_score: z.number().int().min(0).max(100),
  picture_quality_score: z.number().int().min(0).max(100),
  confidence_score: z.number().int().min(0).max(100),
  total_score: z.number().min(0).max(100),
  confidence_level: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().min(1).max(240)).max(10)
});

export type AnalyzerOutput = z.infer<typeof analyzerOutputSchema>;

export class AnalyzerProviderError extends Error {
  constructor(message = "Private analysis failed safely.") {
    super(message);
  }
}

export async function runPlaceholderModeration(): Promise<"approved" | "rejected" | "escalated"> {
  // TODO: Integrate a real adult-content moderation and compliance provider before launch.
  return "approved";
}

function weightedTotal(output: Omit<AnalyzerOutput, "total_score" | "confidence_level" | "warnings">) {
  return Number(
    (
      output.length_score * 0.35 +
      output.girth_score * 0.3 +
      output.skin_clarity_score * 0.15 +
      output.presentation_score * 0.1 +
      output.picture_quality_score * 0.05 +
      output.confidence_score * 0.05
    ).toFixed(2)
  );
}

export async function runPlaceholderAnalyzer(): Promise<AnalyzerOutput> {
  // TODO: Replace this deterministic placeholder with a calibrated private analyzer.
  const base = {
    length_score: 62,
    girth_score: 60,
    skin_clarity_score: 72,
    presentation_score: 70,
    picture_quality_score: 68,
    confidence_score: 35
  };
  return analyzerOutputSchema.parse({
    ...base,
    total_score: weightedTotal(base),
    confidence_level: "low",
    warnings: [
      "Private visual estimate only.",
      "No exact measurement is claimed without a calibration object or known reference scale."
    ]
  });
}

export async function runAnalyzer(upload: Pick<Upload, "storageKey" | "mimeType">): Promise<AnalyzerOutput> {
  if (process.env.AI_PROVIDER === "xai") {
    if (process.env.XAI_API_KEY) return runXaiAnalyzer(upload);
    if (process.env.NODE_ENV === "production") {
      throw new AnalyzerProviderError("xAI analyzer is configured but XAI_API_KEY is missing.");
    }
  }
  return runPlaceholderAnalyzer();
}

function xaiModel() {
  return process.env.XAI_MODEL || "grok-4.3";
}

function xaiSupportedMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

function analyzerJsonSchema() {
  return {
    name: "onlydihs_private_visual_estimate",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "length_score",
        "girth_score",
        "skin_clarity_score",
        "presentation_score",
        "picture_quality_score",
        "confidence_score",
        "total_score",
        "confidence_level",
        "warnings"
      ],
      properties: {
        length_score: { type: "integer", minimum: 0, maximum: 100 },
        girth_score: { type: "integer", minimum: 0, maximum: 100 },
        skin_clarity_score: { type: "integer", minimum: 0, maximum: 100 },
        presentation_score: { type: "integer", minimum: 0, maximum: 100 },
        picture_quality_score: { type: "integer", minimum: 0, maximum: 100 },
        confidence_score: { type: "integer", minimum: 0, maximum: 100 },
        total_score: { type: "number", minimum: 0, maximum: 100 },
        confidence_level: { type: "string", enum: ["low", "medium", "high"] },
        warnings: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 240 } }
      }
    }
  };
}

function analysisPrompt() {
  return [
    "Return structured JSON only for a private adult-only visual estimate.",
    "Do not identify the person. Do not make medical claims. Do not claim exact real-world measurements.",
    "Scores must be integers from 0 to 100 except total_score, which is a weighted number.",
    "Use this exact formula: total_score = length_score * 0.35 + girth_score * 0.30 + skin_clarity_score * 0.15 + presentation_score * 0.10 + picture_quality_score * 0.05 + confidence_score * 0.05.",
    "If the image has no calibration object or known reference scale, cap confidence_score at 45 and include a warning.",
    "If image quality, framing, occlusion, lighting, or angle limits reliability, lower picture_quality_score and confidence_score and include a warning.",
    "Always include these safety warnings when applicable: private visual estimate only; no exact measurement without calibration or known reference scale."
  ].join(" ");
}

async function runXaiAnalyzer(upload: Pick<Upload, "storageKey" | "mimeType">): Promise<AnalyzerOutput> {
  if (!xaiSupportedMimeType(upload.mimeType)) {
    throw new AnalyzerProviderError("xAI analysis currently supports JPEG and PNG uploads only.");
  }

  const imageBytes = await readPrivateObject(upload.storageKey);
  const dataUrl = `data:${upload.mimeType};base64,${imageBytes.toString("base64")}`;

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: xaiModel(),
      store: false,
      response_format: {
        type: "json_schema",
        json_schema: analyzerJsonSchema()
      },
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl, detail: "high" },
            { type: "input_text", text: analysisPrompt() }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new AnalyzerProviderError(`xAI analyzer request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  const text = extractXaiText(payload);
  if (!text) throw new AnalyzerProviderError("xAI analyzer returned no structured output.");

  try {
    return analyzerOutputSchema.parse(JSON.parse(text));
  } catch {
    throw new AnalyzerProviderError("xAI analyzer returned invalid JSON.");
  }
}

function extractXaiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (typeof maybe.output_text === "string") return maybe.output_text;
  for (const item of maybe.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  const choiceContent = maybe.choices?.[0]?.message?.content;
  return typeof choiceContent === "string" ? choiceContent : null;
}
