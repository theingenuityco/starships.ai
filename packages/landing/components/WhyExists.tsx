export function WhyExists() {
  return (
    <section className="border-b border-(--color-border)">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Why Starships exists</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Every team building with AI hits the same wall: the model is the easy part. What kills you is the rest.
          </h2>
          <div className="mt-8 space-y-5 text-lg text-(--color-fg-muted) leading-relaxed">
            <p>
              Multi-tenant auth. OAuth connectors for every tool your customer uses. Background workers. Tool approval flows so agents
              don&rsquo;t go rogue. Streaming UIs. Audit logs. Billing. The thousand pieces between &ldquo;we have an LLM call&rdquo; and
              &ldquo;we have a product.&rdquo;
            </p>
            <p className="text-(--color-fg)">Starships is that thousand pieces. A year of engineering you don&rsquo;t have to redo.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
