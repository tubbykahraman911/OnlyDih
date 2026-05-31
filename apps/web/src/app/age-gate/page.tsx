import Link from "next/link";
import { PhaseShell, Panel } from "../../components/PhaseShell";

export default function AgeGatePage() {
  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Panel>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-300">Adult-only service</p>
          <h1 className="mt-3 text-3xl font-semibold">Identity verification is required before upload.</h1>
          <p className="mt-4 text-zinc-300">
            This page is a warning and routing step, not the only age gate. Account creation and a
            verification-provider status of verified are required before private analysis is unlocked.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/login" className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950">
              Create account or sign in
            </Link>
          </div>
        </Panel>
      </main>
    </PhaseShell>
  );
}
