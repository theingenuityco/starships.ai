export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-(--color-border)">
      <div className="absolute inset-0 bg-glow pointer-events-none" aria-hidden />
      <div className="absolute inset-0 bg-grid pointer-events-none" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-20 sm:pt-32 sm:pb-24">
        <div className="flex items-center gap-2 text-sm text-(--color-fg-muted) mb-8">
          <span className="inline-block h-2 w-2 rounded-full bg-(--color-accent)" />
          <span>Starships</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
          The agent platform you can actually ship on.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-(--color-fg-muted) max-w-2xl leading-relaxed">
          Multi-tenant, connector-rich, production-grade agent infrastructure — so you can stop building the boring parts and start shipping
          real products.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href="/contact"
            className="inline-flex items-center justify-center rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-(--color-accent-strong) transition-colors"
          >
            Book a call →
          </a>
          <a
            href="#what-it-does"
            className="inline-flex items-center justify-center rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-soft) transition-colors"
          >
            See the engine
          </a>
        </div>
      </div>
    </section>
  );
}
