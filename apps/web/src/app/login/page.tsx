"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch, setCsrfToken } from "../../lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    if (mode === "signup") {
      if (!trimmedEmail.includes("@")) {
        setError("Enter a valid email address.");
        setBusy(false);
        return;
      }
      if (trimmedUsername.length < 3) {
        setError("Username must be at least 3 characters.");
        setBusy(false);
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
        setError("Username can only use letters, numbers, and underscores.");
        setBusy(false);
        return;
      }
      if (password.length < 12) {
        setError("Password must be at least 12 characters.");
        setBusy(false);
        return;
      }
    }
    try {
      const payload = mode === "signup" ? { email: trimmedEmail, username: trimmedUsername, password } : { email: trimmedEmail, password };
      const response = await apiFetch<{ csrfToken: string }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setCsrfToken(response.csrfToken);
      router.push("/verification");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (reason as { message?: string }).message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhaseShell>
      <main className="mx-auto max-w-md px-4 py-12">
        <Panel>
          <div className="flex rounded-md border border-white/10 p-1 text-sm">
            <button className={`flex-1 rounded px-3 py-2 ${mode === "login" ? "bg-white text-zinc-950" : "text-zinc-300"}`} onClick={() => setMode("login")}>Login</button>
            <button className={`flex-1 rounded px-3 py-2 ${mode === "signup" ? "bg-white text-zinc-950" : "text-zinc-300"}`} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block text-sm">
              Email
              <input autoComplete="email" type="email" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {mode === "signup" && (
              <label className="block text-sm">
                Username
                <input autoComplete="username" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2" value={username} onChange={(event) => setUsername(event.target.value)} />
                <span className="mt-1 block text-xs text-zinc-400">3-32 letters, numbers, or underscores.</span>
              </label>
            )}
            <label className="block text-sm">
              Password
              <input autoComplete={mode === "signup" ? "new-password" : "current-password"} className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              {mode === "signup" && <span className="mt-1 block text-xs text-zinc-400">At least 12 characters.</span>}
            </label>
            {error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
            <button disabled={busy} onClick={() => void submit()} className="w-full rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-60">
              {busy ? "Working..." : mode === "signup" ? "Create private account" : "Login"}
            </button>
          </div>
        </Panel>
      </main>
    </PhaseShell>
  );
}
