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
          <p className="kicker">Verification gate</p>
          <h1 className="mt-3 text-3xl font-semibold">18+ verification status</h1>
          <p className="mt-4 text-[#5f3f16]">
            Current status: <span className="font-semibold text-[#16120c]">{status?.status ?? "loading"}</span>
          </p>
          {statusMessage && <p className="mt-3 rounded-md border border-[#d6a72f]/35 bg-[#fff8e6] p-3 text-sm text-[#5f3f16]">{statusMessage}</p>}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["ID provider session", "18+ confirmation", "Analyzer unlock"].map((item) => (
              <div key={item} className="rounded-md border border-[#d6a72f]/25 bg-white/60 p-3 text-sm font-semibold text-[#5f3f16]">{item}</div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {!verified && (
              <button onClick={() => void start()} className="gold-button">
                Start verification
              </button>
            )}
            {verified && (
              <Link href="/analyzer" className="gold-button">
                Open analyzer
              </Link>
            )}
          </div>
          {message && <p className="mt-5 rounded-md border border-[#d6a72f]/25 bg-white/60 p-3 text-sm text-[#5f3f16]">{message}</p>}
        </Panel>
      </main>
    </PhaseShell>
  );
}
