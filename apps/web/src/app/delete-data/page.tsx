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
          <p className="kicker">Privacy controls</p>
          <h1 className="text-3xl font-semibold">Delete account and data</h1>
          <p className="mt-3 text-sm leading-6 text-[#5f3f16]">
            This requests deletion, tombstones analyses, deletes private upload objects where possible,
            ends active sessions, and marks the account deleted according to retention settings.
          </p>
          <label className="mt-6 block text-sm">
            Type DELETE to continue
            <input className="honey-input" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          <button disabled={confirm !== "DELETE" || busy} onClick={() => void deleteAccount()} className="danger-button mt-5">
            {busy ? "Deleting..." : "Delete all my data"}
          </button>
        </Panel>
      </main>
    </PhaseShell>
  );
}
