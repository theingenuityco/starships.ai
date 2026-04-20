const testimonials = [
  {
    metric: '847 leads enriched in 43 seconds',
    quote:
      'I spent three weeks trying to build this in Clay. Starships did it in under a minute. I genuinely don\'t know what I was doing before this.',
    author: 'Daniel R.',
    role: 'Founder @ B2B SaaS, Series A',
  },
  {
    metric: '14% reply rate on first campaign',
    quote:
      "One prospect replied saying it was 'the first cold email that didn't feel cold.' That's the bar we've been chasing for two years.",
    author: 'Sana K.',
    role: 'Head of Growth @ Fintech startup',
  },
  {
    metric: '$4,200/month saved vs our SDR team',
    quote:
      "We let one SDR go — not because we wanted to, but because the math made it impossible to justify. The system handles more volume with better results.",
    author: 'Tom W.',
    role: 'VP Sales @ MarTech',
  },
]

export default function SocialProof() {
  return (
    <section className="relative py-20 sm:py-24 px-4 sm:px-6 bg-[#050b24]">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="font-[family-name:var(--font-orbitron)] font-bold text-white text-2xl sm:text-3xl md:text-4xl tracking-tight">
            Founders are already in orbit.
          </h2>
          <p className="mt-3 text-white/55 text-base sm:text-lg max-w-2xl mx-auto">
            Early access results from teams who replaced their outbound motion with Starships.
          </p>
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="frosted-glass-card rounded-xl border border-white/10 p-6 flex flex-col gap-4">
              <div className="text-amber-300 font-bold text-lg sm:text-xl leading-tight">{t.metric}</div>
              <blockquote className="text-white/65 text-sm sm:text-base leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div>
                <p className="text-white/70 text-sm font-semibold">— {t.author}</p>
                <p className="text-white/35 text-xs mt-0.5">{t.role}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Social nudge */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <p className="text-white/45 text-sm">Join 200+ founders on early access</p>

          {/* Asset placeholder: Row of 5 circular avatar placeholders representing early access users — blurred for privacy */}
          <div
            className="flex items-center -space-x-2"
            role="img"
            aria-label="Row of 5 circular avatar placeholders representing early access users — blurred for privacy"
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-8 w-8 rounded-full border-2 border-[#050b24] bg-gradient-to-br from-slate-600 to-slate-800"
                style={{ filter: 'blur(2px)' }}
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
