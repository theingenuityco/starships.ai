import { FadeIn } from './FadeIn';

export function FinalCTA() {
  return (
    <section className="border-b border-(--color-border) bg-(--color-bg-elev)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="max-w-2xl">
          <FadeIn as="p" delay={0} className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">
            Get started
          </FadeIn>
          <FadeIn as="h2" delay={90} className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Tell us what you&rsquo;d want your virtual org to do.
          </FadeIn>
          <FadeIn as="p" delay={180} className="mt-6 text-lg text-(--color-fg-muted) leading-relaxed">
            Drop your name and a line about your business. On the call, we&rsquo;ll sketch what a Starships virtual org would look like for
            you — which rooms, which agents, connected to what.
          </FadeIn>

          <FadeIn delay={270} className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
            >
              Request demo →
            </a>
            <a
              href="mailto:hello@starships.ai"
              className="inline-flex items-center justify-center rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg) transition-colors"
            >
              hello@starships.ai
            </a>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
