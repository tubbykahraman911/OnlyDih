"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

export default function SettingsPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-3 text-sm text-zinc-300">
            Phase 1 keeps settings focused on account access, privacy export, safety status, and deletion.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void exportData()} className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold">
              Export my data
            </button>
            <button onClick={() => void logout()} className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold">
              Logout
            </button>
          </div>
          {message && <p className="mt-4 text-sm text-emerald-200">{message}</p>}
        </Panel>
      </main>
    </PhaseShell>
  );
}
