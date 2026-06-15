import Link from "next/link";
import { PhaseShell, Panel } from "../components/PhaseShell";

export default function LandingPage() {
  return (
    <PhaseShell>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <p className="kicker">Phase 1 private analyzer</p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[#16120c] md:text-6xl">
              A verified adult-only private analyzer with a polished safety vault.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[#5f3f16]">
            OnlyDihs Phase 1 is a private analyzer only. Verified adults can upload one private image,
            consent to analysis, receive a private visual estimate, and delete their data.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/age-gate" className="gold-button">
              Continue
              </Link>
              <Link href="/login" className="honey-button">
              Sign in
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Verified adults only", "Private uploads", "Owner-only results", "Deletion controls"].map((item) => (
                <span key={item} className="privacy-ribbon">{item}</span>
              ))}
            </div>
          </div>
          <Panel className="relative overflow-hidden">
            <div className="absolute right-4 top-4 h-20 w-20 rounded-full border border-[#d6a72f]/30" />
            <div className="absolute right-10 top-10 h-20 w-20 rounded-full border border-[#b7833a]/25" />
            <p className="kicker">Private vault timeline</p>
            <div className="mt-5 space-y-4">
              {[
                ["01", "Verify", "A real provider must confirm 18+ before upload."],
                ["02", "Consent", "Every upload records explicit private-analysis consent."],
                ["03", "Analyze", "Grok returns structured JSON for owner-only results."],
                ["04", "Retain briefly", "Raw uploads follow the configured retention window."],
                ["05", "Delete", "Users can remove an analysis or request account deletion."]
              ].map(([step, title, copy]) => (
                <div key={step} className="grid grid-cols-[42px_1fr] gap-3 rounded-md border border-[#d6a72f]/25 bg-white/55 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#d6a72f] text-sm font-bold text-[#16120c]">{step}</div>
                  <div>
                    <h2 className="font-semibold text-[#16120c]">{title}</h2>
                    <p className="text-sm text-[#6b5127]">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {["No livestreaming", "No matching", "No public galleries", "No DMs or comments"].map((item) => (
            <Panel key={item} className="p-4 text-sm font-semibold text-[#5f3f16]">{item}</Panel>
          ))}
        </section>
      </main>
    </PhaseShell>
  );
}
