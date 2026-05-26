import { PremiumHero } from "../components/PremiumHero";
import { AdultGate } from "../components/AdultGate";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <section className="space-y-6">
        <div className="text-sm text-white/60">Entertainment-only</div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          SizeAI
          <span className="ml-2 bg-gradient-to-r from-fuchsia-300 via-purple-300 to-cyan-200 bg-clip-text text-transparent">
            private anatomy confidence
          </span>
        </h1>
        <p className="max-w-2xl text-white/70">
          A creator subscription platform for consenting adults, with a humor-forward AI confidence
          report. This is not medical software.
        </p>
        {/* Premium UI flourish for the MVP */}
        <div className="flex">
          <PremiumHero />
        </div>
      </section>

      <div className="mt-10">
        <AdultGate>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <div className="text-sm text-white/70">Next step</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Open your feed</h2>
              <p className="mt-2 text-white/70">
                This MVP scaffolding focuses on end-to-end wiring. We’ll add full social features next.
              </p>
              <div className="mt-4">
                <a
                  href="/feed"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-transform active:scale-[0.99]"
                >
                  Go to Feed
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <div className="text-sm text-white/70">Private AI</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Try the analyzer (18+)</h2>
              <p className="mt-2 text-white/70">
                Upload will never be publicly exposed. Results are entertainment-only and confidence-oriented.
              </p>
              <div className="mt-4">
                <a
                  href="/analyzer"
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition active:scale-[0.99]"
                >
                  Open AI Analyzer
                </a>
              </div>
            </div>
          </section>
        </AdultGate>
      </div>
    </main>
  );
}


