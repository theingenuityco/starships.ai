import { FadeIn } from './FadeIn';
import { Icon } from './Icon';

export function FinalCTA() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <FadeIn as="span" delay={0} className="block text-(--color-fg-muted)">
            Stop running a startup.
          </FadeIn>
          <FadeIn as="span" delay={90} className="block text-6xl sm:text-7xl md:text-8xl">
            Start running a
          </FadeIn>
          <FadeIn as="span" delay={180} className="block text-6xl sm:text-7xl md:text-8xl">
            Starship.
          </FadeIn>
        </h2>
        <FadeIn as="p" delay={270} className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
          Tell us what you do. We&rsquo;ll build the org, wire it up, and hand you the keys.
        </FadeIn>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <FadeIn delay={360}>
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
            >
              Launch your Starship
              <Icon name="arrow-right" className="h-4 w-4" />
            </a>
          </FadeIn>
          <FadeIn delay={440}>
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
