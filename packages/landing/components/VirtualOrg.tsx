import { FadeIn } from './FadeIn';

export function VirtualOrg() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-12 sm:pt-24">
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={0}>
            Not a chatbot.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
            Not an assistant.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={180}>
            Not a copilot.
          </FadeIn>
        </h2>

        <div className="mt-56 sm:mt-64">
          <FadeIn as="h2" className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            A virtual org that runs 24x7.
          </FadeIn>
          <p className="mt-8 max-w-2xl text-xl text-(--color-fg) leading-relaxed">
            <FadeIn as="span" className="block" delay={120}>
              Open your laptop in the morning.
            </FadeIn>
            <FadeIn as="span" className="block" delay={210}>
              The work that needed doing is already done.
            </FadeIn>
          </p>
        </div>
      </div>
    </section>
  );
}
