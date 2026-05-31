export type AnalyzerOutput = {
  length_score: number;
  girth_score: number;
  skin_clarity_score: number;
  presentation_score: number;
  picture_quality_score: number;
  confidence_score: number;
  total_score: number;
  confidence_level: "low" | "medium" | "high";
  warnings: string[];
};

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
  return {
    ...base,
    total_score: weightedTotal(base),
    confidence_level: "low",
    warnings: [
      "Private visual estimate only.",
      "No exact measurement is claimed without a calibration object or known reference scale."
    ]
  };
}
