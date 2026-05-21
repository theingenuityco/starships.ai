import { FadeIn } from './FadeIn';

export function VirtualOrg() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-12 sm:pt-24">
        <FadeIn>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            <span className="text-(--color-fg-muted)">Not a chatbot.</span>
            <br />
            <span className="text-(--color-fg-muted)">Not an assistant.</span>
            <br />
            <span className="text-(--color-fg-muted)">Not a copilot.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={300} className="mt-56 sm:mt-64">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            A virtual org that runs 24x7.
          </h2>
          <p className="mt-8 max-w-2xl text-xl text-(--color-fg) leading-relaxed">
            Open your laptop in the morning.
            <br />
            The work that needed doing is already half done.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
