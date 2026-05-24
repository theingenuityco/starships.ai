import type { Metadata } from 'next';
import { FadeIn } from '@/components/FadeIn';
import { Closer, Hero, steps } from './_screens';

export const metadata: Metadata = {
  title: 'How it works — Starships',
  description: 'From a sentence about your company to an org that runs itself. Set up, organize, staff, connect, direct, and operate your Starship.',
};

export const dynamic = 'force-static';

export default function HowItWorksPage() {
  return (
    <main>
      <Hero />

      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <div className="space-y-16 sm:space-y-24">
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              return (
                <div key={s.n} className="grid grid-cols-[36px_1fr] gap-5 sm:grid-cols-[44px_1fr] sm:gap-10">
                  {/* Spine node */}
                  <div className="relative flex justify-center">
                    {!isLast && (
                      <span
                        className="absolute left-1/2 top-9 -bottom-16 w-px -translate-x-1/2 bg-(--color-border) sm:top-11 sm:-bottom-24"
                        aria-hidden
                      />
                    )}
                    <FadeIn>
                      <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-(--color-border-strong) bg-(--color-bg-elev) font-mono text-sm text-(--color-fg) sm:h-11 sm:w-11">
                        {s.n}
                      </span>
                    </FadeIn>
                  </div>

                  {/* Content */}
                  <div className="pt-1 sm:pt-2">
                    <FadeIn>
                      <p className="font-brand text-xs uppercase tracking-widest text-(--color-fg-subtle)">{s.label}</p>
                    </FadeIn>
                    <FadeIn as="h2" delay={80} className="mt-3 text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">
                      {s.title}
                    </FadeIn>
                    <FadeIn as="ul" delay={160} className="mt-6 space-y-3">
                      {s.points.map((p) => (
                        <li key={p} className="flex items-start gap-3 text-[15px] leading-relaxed text-(--color-fg-muted)">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-(--color-fg-subtle)" />
                          {p}
                        </li>
                      ))}
                    </FadeIn>
                    <FadeIn delay={220} className="mt-8 block">
                      {s.screen}
                    </FadeIn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Closer />
    </main>
  );
}
