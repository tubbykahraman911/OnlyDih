import Link from "next/link";
import { PhaseShell, Panel } from "../components/PhaseShell";

export default function LandingPage() {
  return (
    <PhaseShell>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Phase 1 private MVP</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Private adult-only visual estimates, locked behind real verification.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-300">
            OnlyDihs Phase 1 is a private analyzer only. Verified adults can upload one private image,
            consent to analysis, receive a private visual estimate, and delete their data.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/age-gate" className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950">
              Continue
            </Link>
            <Link href="/login" className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100">
              Sign in
            </Link>
          </div>
        </section>
        <Panel className="self-start">
          <h2 className="text-xl font-semibold">Phase 1 boundaries</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-300">
            <li>No livestreaming, matching, DMs, comments, public galleries, public profiles, leaderboards, battle mode, or sharing links.</li>
            <li>Uploads are blocked until provider-backed 18+ verification is marked verified.</li>
            <li>Results are private visual estimates, not medical advice or exact measurements.</li>
            <li>Raw files use private storage and short-lived presigned upload URLs.</li>
          </ul>
        </Panel>
      </main>
    </PhaseShell>
  );
}
