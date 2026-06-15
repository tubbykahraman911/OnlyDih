"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

export default function SettingsPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [safetyStatus, setSafetyStatus] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch("/api/auth/me").catch((reason) => {
      if (isUnauthorized(reason)) router.push("/login");
    });
  }, [router]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function exportData() {
    const data = await apiFetch("/api/privacy/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "onlydihs-private-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Private data export downloaded.");
  }

  async function checkSafetyStatus() {
    const response = await apiFetch<{ status: { phase: string; reportingAvailable: boolean; publicInteractionEnabled: boolean } }>("/api/safety/status");
    setSafetyStatus(`${response.status.phase}; reporting ${response.status.reportingAvailable ? "available" : "unavailable"}; public interaction ${response.status.publicInteractionEnabled ? "on" : "off"}.`);
  }

  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel>
          <p className="kicker">Account controls</p>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-3 text-sm text-[#5f3f16]">
            Phase 1 keeps settings focused on account access, privacy export, safety status, and deletion.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void exportData()} className="honey-button">
              Export my data
            </button>
            <button onClick={() => void checkSafetyStatus()} className="honey-button">
              Check safety status
            </button>
            <button onClick={() => void logout()} className="gold-button">
              Logout
            </button>
          </div>
          {message && <p className="mt-4 text-sm text-[#5f3f16]">{message}</p>}
          {safetyStatus && <p className="mt-3 rounded-md border border-[#d6a72f]/25 bg-white/60 p-3 text-sm text-[#5f3f16]">{safetyStatus}</p>}
        </Panel>
      </main>
    </PhaseShell>
  );
}
