"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../../components/PhaseShell";
import { apiFetch } from "../../../lib/apiClient";
import { isUnauthorized } from "../../../lib/authRedirect";

type Result = {
  id: string;
  lengthScore: number;
  girthScore: number;
  skinClarityScore: number;
  presentationScore: number;
  pictureQualityScore: number;
  confidenceScore: number;
  totalScore: number;
  confidenceLevel: string;
  warningsJson: string[];
};

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    void apiFetch<{ result: Result }>(`/api/analysis/${params.id}`)
      .then((response) => setResult(response.result))
      .catch((reason) => {
        if (isUnauthorized(reason)) router.push("/login");
      });
  }, [params.id, router]);

  async function deleteAnalysis() {
    if (!result) return;
    await apiFetch(`/api/privacy/delete-analysis/${result.id}`, { method: "POST" });
    router.push("/profile");
  }

  return (
    <PhaseShell>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Panel>
          {!result ? (
            <p className="text-sm text-zinc-300">Loading private result...</p>
          ) : (
            <>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Private visual estimate</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-semibold">{result.totalScore.toFixed(1)} / 100</h1>
                  <p className="mt-2 text-sm text-zinc-300">Confidence level: {result.confidenceLevel}</p>
                </div>
                <button onClick={() => void deleteAnalysis()} className="rounded-md border border-red-300/40 px-4 py-2 text-sm font-semibold text-red-100">
                  Delete analysis
                </button>
              </div>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["Length", result.lengthScore],
                  ["Girth", result.girthScore],
                  ["Skin clarity", result.skinClarityScore],
                  ["Presentation", result.presentationScore],
                  ["Picture quality", result.pictureQualityScore],
                  ["Confidence/calibration", result.confidenceScore]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-white/10 bg-zinc-950 p-3">
                    <dt className="text-sm text-zinc-400">{label}</dt>
                    <dd className="mt-1 text-xl font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 rounded-md border border-white/10 bg-zinc-950 p-4">
                <h2 className="font-semibold">Warnings</h2>
                <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                  {(result.warningsJson ?? []).map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            </>
          )}
        </Panel>
      </main>
    </PhaseShell>
  );
}
