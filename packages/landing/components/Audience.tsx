const personas = [
  {
    title: 'Partners & agencies',
    body: 'Building branded AI products for clients.',
  },
  {
    title: 'Product teams',
    body: 'Shipping vertical agent applications on top of proven infrastructure.',
  },
  {
    title: 'Engineering teams',
    body: 'Running agent workflows internally — securely, on your own infra.',
  },
];

export function Audience() {
  return (
    <section className="border-b border-(--color-border)">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Who builds with this</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          If you&rsquo;re building anything where AI needs to <em className="not-italic text-(--color-accent)">do things</em> — not just
          respond — let&rsquo;s talk.
        </h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {personas.map((p) => (
            <div key={p.title} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6">
              <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-(--color-fg-muted) leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
