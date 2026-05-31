"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch, getCsrfToken } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

const consentLabels = {
  isPersonInContent: "I am the person in the submitted content.",
  isAdult: "I am 18 or older.",
  privateAnalysisConsent: "I consent to private analysis.",
  understandsPrivateResult: "I understand the result is private and not publicly shared."
};

type ConsentKey = keyof typeof consentLabels;
type UploadState = { upload?: { id: string; status: string; moderationStatus: string }; result?: { id: string } | null };
type PresignResponse = { uploadId: string; uploadUrl: string; uploadMode?: "local" | "s3" };

export default function AnalyzerPage() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState<Record<ConsentKey, boolean>>({
    isPersonInContent: false,
    isAdult: false,
    privateAnalysisConsent: false,
    understandsPrivateResult: false
  });
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allConsent = useMemo(() => Object.values(consent).every(Boolean), [consent]);
  const pollingUploadId = state?.upload?.id;
  const pollingUploadStatus = state?.upload?.status;

  useEffect(() => {
    void apiFetch<{ status: string }>("/api/verification/status")
      .then((response) => setVerified(response.status === "verified"))
      .catch((reason) => {
        if (isUnauthorized(reason)) router.push("/login");
        setVerified(false);
      });
  }, [router]);

  useEffect(() => {
    if (!pollingUploadId || !pollingUploadStatus || ["completed", "failed", "quarantined"].includes(pollingUploadStatus)) return;
    const timer = window.setInterval(() => {
      void apiFetch<UploadState>(`/api/analysis/${pollingUploadId}`).then((response) => {
        setState(response);
      });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [pollingUploadId, pollingUploadStatus]);

  async function uploadAndAnalyze() {
    if (!file || !allConsent || !verified) return;
    setBusy(true);
    setError(null);
    try {
      const presign = await apiFetch<PresignResponse>("/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ originalFilename: file.name, mimeType: file.type, fileSize: file.size })
      });
      const uploadHeaders = new Headers({ "Content-Type": file.type });
      if (presign.uploadMode === "local") {
        const token = getCsrfToken();
        if (token) uploadHeaders.set("x-csrf-token", token);
      }
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: file,
        headers: uploadHeaders,
        credentials: presign.uploadMode === "local" ? "include" : "omit"
      }).catch(() => {
        throw new Error(
          presign.uploadMode === "local"
            ? "Could not reach the local upload endpoint. Confirm the API server is running."
            : "Could not reach private object storage. Storage may not be configured for local development."
        );
      });
      if (!put.ok) {
        const details = (await put.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(details?.error?.message ?? "Private storage upload failed");
      }
      await apiFetch("/api/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ uploadId: presign.uploadId, consent })
      });
      setState({ upload: { id: presign.uploadId, status: "pending", moderationStatus: "pending" }, result: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (reason as { message?: string }).message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhaseShell>
      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-8 lg:grid-cols-[380px_1fr]">
        <Panel>
          <h1 className="text-2xl font-semibold">Private analyzer upload</h1>
          {!verified && (
            <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              Verification is required before uploading. <Link className="underline" href="/verification">Check verification</Link>
            </div>
          )}
          <label className="mt-5 block text-sm">
            Private image
            <input disabled={!verified} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-2 file:text-zinc-950 disabled:opacity-50" />
          </label>
          <div className="mt-5 space-y-3">
            {(Object.keys(consentLabels) as ConsentKey[]).map((key) => (
              <label key={key} className="flex gap-3 text-sm text-zinc-300">
                <input type="checkbox" checked={consent[key]} onChange={(event) => setConsent((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" />
                <span>{consentLabels[key]}</span>
              </label>
            ))}
          </div>
          {error && <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          <button disabled={!verified || !file || !allConsent || busy} onClick={() => void uploadAndAnalyze()} className="mt-5 w-full rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">
            {busy ? "Uploading privately..." : "Upload for private analysis"}
          </button>
        </Panel>
        <Panel>
          <h2 className="text-xl font-semibold">Status</h2>
          {!state ? (
            <p className="mt-3 text-sm text-zinc-300">No upload in progress.</p>
          ) : state.result ? (
            <div className="mt-3">
              <p className="text-sm text-zinc-300">Analysis completed.</p>
              <Link href={`/results/${state.result.id}`} className="mt-4 inline-flex rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950">
                View private result
              </Link>
            </div>
          ) : state.upload?.status === "quarantined" || state.upload?.moderationStatus === "rejected" ? (
            <p className="mt-3 text-sm text-zinc-300">This upload could not be processed. Please review the safety guidance or contact support.</p>
          ) : (
            <p className="mt-3 text-sm text-zinc-300">Upload status: {state.upload?.status}. Moderation: {state.upload?.moderationStatus}.</p>
          )}
        </Panel>
      </main>
    </PhaseShell>
  );
}
