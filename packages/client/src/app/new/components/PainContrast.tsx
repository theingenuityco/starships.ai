const painItems = [
  '3–5 hours manually researching each lead in LinkedIn and Apollo',
  'Copy-paste templates every prospect has seen 40 times',
  '$8,000+/month per SDR — who still makes mistakes',
  '2-week sprint to send 200 emails. Your competitors sent 5,000.',
  'Quality collapses as volume increases',
]

const gainItems = [
  'ICPs identified automatically from your brief — no configuration',
  '10,000 leads discovered and enriched in under 60 seconds',
  "Every email is different. Personalized to the individual's actual context.",
  'Zero SDRs. One seat. Full pipeline.',
  'Quality improves with scale — the system learns what works',
]

export default function PainContrast() {
  return (
    <section className="relative py-20 sm:py-24 px-4 sm:px-6 bg-[#171717]">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-2xl sm:text-3xl md:text-4xl tracking-tight">
            Most teams are still doing this the hard way.
          </h2>
          <p className="mt-3 text-white/55 text-base sm:text-lg max-w-2xl mx-auto">
            Manual outreach is slow, generic, and expensive. There&apos;s a faster orbit.
          </p>
        </div>

        {/* Two-column contrast */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* The Old Way */}
          <div className="frosted-glass-card rounded-2xl border border-red-500/20 bg-red-950/20 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
                <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="font-[family-name:var(--font-orbitron)] font-bold text-red-400 text-lg tracking-wide">The Old Way</h3>
            </div>
            <ul className="space-y-4">
              {painItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg
                    className="h-5 w-5 text-red-500/60 mt-0.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-white/60 text-sm sm:text-base leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The Starships Way */}
          <div className="frosted-glass-card rounded-2xl border border-amber-400/30 bg-amber-950/10 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 border border-amber-400/30">
                <svg
                  className="h-4 w-4 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-[family-name:var(--font-orbitron)] font-bold text-amber-300 text-lg tracking-wide">The Starships Way</h3>
            </div>
            <ul className="space-y-4">
              {gainItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg
                    className="h-5 w-5 text-amber-400 mt-0.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-white/80 text-sm sm:text-base leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
