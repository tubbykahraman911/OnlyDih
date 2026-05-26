"use client";

import * as React from "react";
import { supabase } from "../lib/supabaseClient";
import { apiFetch } from "../lib/apiClient";
import { Button, GlassCard } from "@sizeai/ui";

type MeResponse = {
  id: string;
  handle?: string | null;
  role: "FAN" | "CREATOR" | "ADMIN";
  ageVerifiedAt: string | null;
  consentedAt: string | null;
  isBanned: boolean;
};

export function AdultGate({ children }: { children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = React.useState(false);
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [gateOpen, setGateOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const refreshMe = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MeResponse>("/me");
      setMe(data);
      setGateOpen(!data.ageVerifiedAt || !data.consentedAt);
    } catch (e: any) {
      setMe(null);
      setGateOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const sessionRes = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionReady(true);
      if (sessionRes.data.session) await refreshMe();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const sessionRes = await supabase.auth.getSession();
      if (!sessionRes.data.session) {
        setMe(null);
        setGateOpen(false);
        return;
      }
      await refreshMe();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const [email, setEmail] = React.useState("");
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  async function handleSendMagicLink() {
    setLoginError(null);
    setLoginBusy(true);
    try {
      const emailTrim = email.trim();
      if (!emailTrim) throw new Error("Enter an email.");
      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: emailTrim,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
    } catch (e: any) {
      setLoginError(e?.message ?? "Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleConfirm() {
    setErr(null);
    setLoading(true);
    try {
      await apiFetch("/age/verify", {
        method: "POST",
        body: JSON.stringify({ confirmed: true })
      });
      await apiFetch("/age/consent/ack", {
        method: "POST",
        body: JSON.stringify({ confirmed: true })
      });
      await refreshMe();
      setGateOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to confirm");
    } finally {
      setLoading(false);
    }
  }

  const session = me ? true : false;

  if (!sessionReady) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <div className="text-white/70">Loading...</div>
      </div>
    );
  }

  const isAdult = !!me?.ageVerifiedAt && !!me?.consentedAt;

  if (!me) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14">
        <GlassCard className="p-6 md:p-8">
          <div className="text-sm text-white/70">Login (MVP)</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Enter your account</h2>
          <p className="mt-3 text-white/70">
            We’ll use Supabase magic links. After login, you must confirm 18+ eligibility and
            consent for analyzer features.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <label className="text-sm text-white/70">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-fuchsia-300/40"
              />
            </label>
            {loginError ? <div className="text-sm text-red-300">{loginError}</div> : null}
            <Button type="button" onClick={handleSendMagicLink} disabled={loginBusy}>
              {loginBusy ? "Sending..." : "Send magic link"}
            </Button>
          </div>
        </GlassCard>
      </main>
    );
  }

  if (me.isBanned) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14">
        <GlassCard className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Account disabled</h2>
          <p className="mt-3 text-white/70">Please contact support.</p>
        </GlassCard>
      </main>
    );
  }

  if (!isAdult) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14">
        <GlassCard className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">18+ gate required</h2>
          <p className="mt-3 text-white/70">
            SizeAI’s private AI analyzer is entertainment-only and requires an explicit
            confirmation that you are 18+ and consent to analysis. This is not medical software.
          </p>
          <Button
            type="button"
            onClick={() => setGateOpen(true)}
            className="mt-5 w-full"
          >
            Confirm eligibility
          </Button>

          {gateOpen ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/70">Confirmation</div>
              <div className="mt-2 text-white/80">
                I confirm I am 18+ and consent to entertainment-only analysis.
              </div>
              {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}
              <div className="mt-4 flex gap-3">
                <Button type="button" onClick={() => setGateOpen(false)} variant="ghost">
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={loading}>
                  {loading ? "Confirming..." : "Confirm"}
                </Button>
              </div>
            </div>
          ) : null}
        </GlassCard>
      </main>
    );
  }

  return <>{children}</>;
}

