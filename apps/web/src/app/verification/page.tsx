"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

type VerificationStatus = {
  status: "pending" | "pending_age_review" | "verified" | "failed" | "expired";
  verification?: { providerVerificationId: string; provider: string; ageOver18Confirmed: boolean } | null;
};

export default function VerificationPage() {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const next = await apiFetch<VerificationStatus>("/api/verification/status");
    setStatus(next);
  }

  async function start() {
    const response = await apiFetch<{ provider: string; verificationId: string; verificationUrl: string }>("/api/verification/start", { method: "POST" });
    if (response.verificationUrl) {
      window.location.href = response.verificationUrl;
      return;
    }
    setMessage(`Verification session created: ${response.verificationId}.`);
    await load();
  }

  useEffect(() => {
    void load().catch((reason) => {
      if (isUnauthorized(reason)) router.push("/login");
      setMessage("Please login before verification.");
    });
  }, [router]);

  useEffect(() => {
    if (!status || !["pending", "pending_age_review"].includes(status.status)) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status]);

  const verified = status?.status === "verified" && status.verification?.ageOver18Confirmed === true;
  const statusMessage =
    status?.status === "pending_age_review"
      ? "Your identity check was received, but age confirmation needs review before uploads unlock."
      : status?.status === "failed"
        ? "Verification could not be completed. Start a new session to try again."
        : status?.status === "expired"
          ? "Verification expired or was canceled. Start a new session to try again."
          : null;

  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Panel>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Verification gate</p>
          <h1 className="mt-3 text-3xl font-semibold">18+ verification status</h1>
          <p className="mt-4 text-zinc-300">
            Current status: <span className="font-semibold text-white">{status?.status ?? "loading"}</span>
          </p>
          {statusMessage && <p className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{statusMessage}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {!verified && (
              <button onClick={() => void start()} className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950">
                Start verification
              </button>
            )}
            {verified && (
              <Link href="/analyzer" className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950">
                Open analyzer
              </Link>
            )}
          </div>
          {message && <p className="mt-5 rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm text-zinc-300">{message}</p>}
        </Panel>
      </main>
    </PhaseShell>
  );
}
