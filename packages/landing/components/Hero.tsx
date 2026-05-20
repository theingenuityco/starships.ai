import { FadeIn } from './FadeIn';
import { HeroBackground } from './HeroBackground';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-glow pointer-events-none" aria-hidden />
      <HeroBackground className="absolute inset-0 pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 pt-44 pb-12 sm:pt-52 sm:pb-16">
        <FadeIn delay={0}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            Starship. Your startup, on autopilot.
          </h1>
        </FadeIn>

        <FadeIn delay={120} className="mt-8 max-w-2xl">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold tracking-tight">star&middot;ship</span>
            <span className="font-serif italic text-(--color-fg-muted)">/ ˈstɑːr.ʃɪp /</span>
            <span className="font-serif italic text-sm text-(--color-fg-muted)">noun</span>
          </div>
          <p className="mt-3 text-lg text-(--color-fg-muted) leading-relaxed">
            A new generation of startup, built natively around autonomous AI agents.
          </p>
          <p className="mt-3 font-serif italic text-(--color-fg-subtle)">
            &ldquo;The starship is to AI, what the startup was to the internet.&rdquo;
          </p>
        </FadeIn>

        <FadeIn delay={260} className="mt-16 sm:mt-20">
          <div className="relative aspect-video rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) overflow-hidden shadow-2xl shadow-black/40">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src="/hero.mp4"
              poster="/screenshots/01-room.svg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Starships product walkthrough"
            />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
