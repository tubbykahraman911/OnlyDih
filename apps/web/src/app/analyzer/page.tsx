"use client";

import * as React from "react";
import { AdultGate } from "../../components/AdultGate";
import { apiFetch } from "../../lib/apiClient";
import { Button, GlassCard } from "@sizeai/ui";

type AnalyzerRadar = Record<string, number>;
type AnalyzerResult = {
  overallScore: number;
  percentile: number;
  label: string;
  confidence: number | null;
  radar: AnalyzerRadar;
  feedback: { humor?: string; confidence?: string };
  aiSummary: string;
};

type AnalyzerJob = {
  id: string;
  status: string;
  createdAt: string;
  autoDeleteAfterProcessing: boolean;
  result: AnalyzerResult | null;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function RadarChart({ radar }: { radar: AnalyzerRadar }) {
  const keys = ["Length", "Girth", "Symmetry", "Skin clarity", "Presentation", "Photo quality"] as const;
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const r = 130;

  const values = keys.map((k) => clamp01((radar[k] ?? 0) / 100));

  const points = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    const px = cx + Math.cos(angle) * r * v;
    const py = cy + Math.sin(angle) * r * v;
    return `${px},${py}`;
  });

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="max-w-[420px]">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <circle key={t} cx={cx} cy={cy} r={r * t} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      ))}
      {values.map((_, i) => {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.10)" />;
      })}
      <polygon points={points.join(" ")} fill="rgba(168,85,247,0.18)" stroke="rgba(168,85,247,0.70)" strokeWidth="2" />
      {values.map((v, i) => {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        return (
          <text
            key={i}
            x={px}
            y={py}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.65)"
            fontSize="12"
          >
            {keys[i]}
          </text>
        );
      })}
    </svg>
  );
}

export default function AnalyzerPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [autoDelete, setAutoDelete] = React.useState(true);
  const [consentChecked, setConsentChecked] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<AnalyzerJob | null>(null);

  const [history, setHistory] = React.useState<AnalyzerJob[]>([]);

  async function refreshHistory() {
    const data = await apiFetch<{ items: AnalyzerJob[] }>("/analyzer/jobs");
    setHistory((data.items ?? []).filter((j) => !!j));
  }

  React.useEffect(() => {
    void refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function uploadAndAnalyze() {
    if (!file) return setErr("Choose an image first.");
    if (!consentChecked) return setErr("Consent checkbox is required.");
    setErr(null);
    setBusy(true);
    try {
      const init = await apiFetch<{ r2Key: string; signedPutUrl: string; expiresInSeconds: number }>("/uploads/init", {
        method: "POST",
        body: JSON.stringify({
          purpose: "analyzer",
          mimeType: file.type || "application/octet-stream",
          fileName: file.name
        })
      });

      const putResp = await fetch(init.signedPutUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
      });
      if (!putResp.ok) throw new Error(`Upload failed: ${putResp.status}`);

      const complete = await apiFetch<{ ok: true; mediaId: string }>("/uploads/complete", {
        method: "POST",
        body: JSON.stringify({
          r2Key: init.r2Key,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          isAdult: true
        })
      });

      const submit = await apiFetch<{ ok: true; jobId: string }>("/analyzer/submit", {
        method: "POST",
        body: JSON.stringify({
          mediaId: complete.mediaId,
          consented: true,
          autoDeleteAfterProcessing: autoDelete
        })
      });
      setJobId(submit.jobId);

      // Poll job state until completion
      for (let i = 0; i < 60; i++) {
        const jobRes = await apiFetch<{ result: AnalyzerResult | null; status: string; createdAt: string; autoDeleteAfterProcessing: boolean; id: string }>(
          `/analyzer/jobs/${submit.jobId}`
        );
        const j: AnalyzerJob = {
          id: jobRes.id,
          status: jobRes.status,
          createdAt: jobRes.createdAt,
          autoDeleteAfterProcessing: jobRes.autoDeleteAfterProcessing,
          result: jobRes.result
        };
        setJob(j);
        if (j.status === "COMPLETED" || j.status === "FAILED") break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      await refreshHistory();
    } catch (e: any) {
      setErr(e?.message ?? "Analyzer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdultGate>
      <div className="mx-auto max-w-4xl p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm text-white/70">Private analyzer</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">AI Analyzer</h1>
            <p className="mt-2 text-white/70">
              Entertainment-only, confidence-oriented scoring. No medical claims.
            </p>
          </div>
          <GlassCard className="p-4 md:w-[320px]">
            <div className="text-sm text-white/70">Privacy</div>
            <div className="mt-2 text-sm text-white/80">
              Uploads are private (signed URLs only). If enabled, media is auto-deleted after processing.
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={autoDelete} onChange={(e) => setAutoDelete(e.target.checked)} />
              Auto-delete after processing
            </label>
          </GlassCard>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <GlassCard className="p-5">
            <div className="text-sm text-white/70">Upload image</div>
            <div className="mt-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-white/70"
              />
            </div>

            {previewUrl ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="h-auto w-full object-contain" />
              </div>
            ) : null}

            <label className="mt-4 flex items-start gap-3 text-sm text-white/75">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1"
              />
              I confirm I am 18+ and consent to entertainment-only analysis. Not medical advice.
            </label>

            {err ? <div className="mt-3 text-sm text-red-300">{err}</div> : null}

            <div className="mt-4">
              <Button onClick={() => void uploadAndAnalyze()} disabled={busy} className="w-full rounded-xl">
                {busy ? "Analyzing..." : "Analyze privately"}
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="text-sm text-white/70">Result</div>
            {!job ? (
              <div className="mt-3 text-white/70">Upload an image to generate a confidence-oriented report.</div>
            ) : (
              <div className="mt-3 space-y-4">
                <div>
                  <div className="text-sm text-white/70">Status</div>
                  <div className="mt-1 text-white/90">{job.status}</div>
                </div>

                {job.result ? (
                  <>
                    <div>
                      <div className="text-sm text-white/70">Overall score</div>
                      <div className="mt-1 text-4xl font-semibold tracking-tight">
                        {job.result.overallScore}/100
                      </div>
                      <div className="mt-2 text-sm text-white/70">Percentile (for fun): {job.result.percentile}</div>
                      <div className="mt-2 text-sm text-white/80">Label: {job.result.label}</div>
                      <div className="mt-2 text-sm text-white/70">
                        Confidence: {job.result.confidence != null ? `${Math.round(job.result.confidence * 100)}%` : "N/A"}
                      </div>
                    </div>

                    <div>
                      <RadarChart radar={job.result.radar} />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-white/70">Humor feedback</div>
                      <div className="mt-2 text-sm text-white/90">{job.result.feedback?.humor}</div>
                      <div className="mt-3 text-sm text-white/70">{job.result.feedback?.confidence}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-white/70">AI summary</div>
                      <div className="mt-2 text-sm text-white/90">{job.result.aiSummary}</div>
                    </div>

                    <div className="text-xs text-white/50">
                      Entertainment-only scoring. Not medical software. Do not treat results as clinical advice.
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </GlassCard>
        </div>

        <div className="mt-5">
          <div className="text-sm text-white/70">History</div>
          <div className="mt-2 space-y-3">
            {history.slice(0, 5).map((j) => (
              <div key={j.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white/70">{new Date(j.createdAt).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-white/90">
                      {j.status} {j.autoDeleteAfterProcessing ? "(auto-delete)" : ""}
                    </div>
                  </div>
                  {j.result ? <div className="text-sm text-white/80">{j.result.overallScore}/100</div> : null}
                </div>
              </div>
            ))}
            {!history.length ? <div className="text-white/70">No analyzer runs yet.</div> : null}
          </div>
        </div>
      </div>
    </AdultGate>
  );
}

