"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

export default function DeleteDataPage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiFetch("/api/auth/me").catch((reason) => {
      if (isUnauthorized(reason)) router.push("/login");
    });
  }, [router]);

  async function deleteAccount() {
    setBusy(true);
    await apiFetch("/api/privacy/delete-account", { method: "POST" });
    router.push("/");
  }

  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel>
          <h1 className="text-3xl font-semibold">Delete account and data</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            This requests deletion, tombstones analyses, deletes private upload objects where possible,
            ends active sessions, and marks the account deleted according to retention settings.
          </p>
          <label className="mt-6 block text-sm">
            Type DELETE to continue
            <input className="mt-2 w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          <button disabled={confirm !== "DELETE" || busy} onClick={() => void deleteAccount()} className="mt-5 rounded-md border border-red-300/40 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-50">
            {busy ? "Deleting..." : "Delete all my data"}
          </button>
        </Panel>
      </main>
    </PhaseShell>
  );
}
