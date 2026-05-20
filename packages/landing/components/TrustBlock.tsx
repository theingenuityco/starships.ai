export function TrustBlock() {
  return (
    <section className="border-b border-(--color-border) bg-(--color-bg-elev)">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Engineering depth</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Built like infrastructure, not a demo.</h2>
          <p className="mt-6 text-lg text-(--color-fg-muted) leading-relaxed">
            One year of engineering. ~50k lines of TypeScript. Multi-tenant from day one. Production patterns end-to-end — auth, queues,
            streaming, audit logs, observability.
          </p>
          <p className="mt-4 text-(--color-fg) leading-relaxed">Open-source release coming. Get early access by booking a call.</p>
        </div>
      </div>
    </section>
  );
}
