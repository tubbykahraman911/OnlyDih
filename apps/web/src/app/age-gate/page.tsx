import Link from "next/link";
import { PhaseShell, Panel } from "../../components/PhaseShell";

export default function AgeGatePage() {
  return (
    <PhaseShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Panel>
          <p className="kicker">Adult-only service</p>
          <h1 className="mt-3 text-3xl font-semibold text-[#16120c]">Identity verification is required before upload.</h1>
          <p className="mt-4 text-[#5f3f16]">
            This page is a warning and routing step, not the only age gate. Account creation and a
            verification-provider status of verified are required before private analysis is unlocked.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["No anonymous upload", "No public result", "No sharing links"].map((item) => (
              <div key={item} className="rounded-md border border-[#d6a72f]/25 bg-white/60 p-3 text-sm font-semibold text-[#5f3f16]">{item}</div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <Link href="/login" className="gold-button">
              Create account or sign in
            </Link>
          </div>
        </Panel>
      </main>
    </PhaseShell>
  );
}
