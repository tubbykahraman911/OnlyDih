"use client";

import { type FormEvent, useState } from "react";
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
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
      await apiFetch("/api/auth/me");
      setMessage("Logged in successfully. Redirecting...");
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
          <p className="kicker">Private access</p>
          <h1 className="mt-2 text-3xl font-semibold">Enter the vault</h1>
          <div className="mt-5 flex rounded-md border border-[#d6a72f]/25 bg-white/55 p-1 text-sm">
            <button type="button" className={`flex-1 rounded px-3 py-2 ${mode === "login" ? "bg-[#d6a72f] text-[#16120c]" : "text-[#5f3f16]"}`} onClick={() => setMode("login")}>Login</button>
            <button type="button" className={`flex-1 rounded px-3 py-2 ${mode === "signup" ? "bg-[#d6a72f] text-[#16120c]" : "text-[#5f3f16]"}`} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
            <label className="block text-sm">
              Email
              <input autoComplete="email" type="email" className="honey-input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {mode === "signup" && (
              <label className="block text-sm">
                Username
                <input autoComplete="username" className="honey-input" value={username} onChange={(event) => setUsername(event.target.value)} />
                <span className="mt-1 block text-xs text-[#7b6134]">3-32 letters, numbers, or underscores.</span>
              </label>
            )}
            <label className="block text-sm">
              Password
              <input autoComplete={mode === "signup" ? "new-password" : "current-password"} className="honey-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              {mode === "signup" && <span className="mt-1 block text-xs text-[#7b6134]">At least 12 characters.</span>}
            </label>
            {error && <p className="rounded-md border border-red-300/60 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {message && <p className="rounded-md border border-[#d6a72f]/30 bg-[#fff8e6] p-3 text-sm text-[#5f3f16]">{message}</p>}
            <button type="submit" disabled={busy} className="gold-button w-full">
              {busy ? "Working..." : mode === "signup" ? "Create private account" : "Login"}
            </button>
          </form>
        </Panel>
      </main>
    </PhaseShell>
  );
}
