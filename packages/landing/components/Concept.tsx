const departments = [
  {
    name: 'Engineering',
    tools: 'GitHub, your tracker, your monitoring',
  },
  {
    name: 'Sales',
    tools: 'LinkedIn, email, your CRM',
  },
  {
    name: 'Ops',
    tools: 'Support inbox, docs, dashboards',
  },
];

export function Concept() {
  return (
    <section id="how-it-works" className="border-b border-(--color-border) bg-(--color-bg-elev)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">The idea</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            A virtual org of agent teams. Connected to your real tools. Under your control.
          </h2>
          <p className="mt-6 text-lg text-(--color-fg-muted) leading-relaxed">
            Each room in Starships is a focused team of AI agents — like a department. Engineering. Sales. Ops. Each room has access to the
            tools that team needs. They run on schedules and triggers. They check in with you before anything irreversible.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {departments.map((d) => (
            <div key={d.name} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) p-6">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-(--color-accent)" />
                <h3 className="text-lg font-semibold tracking-tight">{d.name} room</h3>
              </div>
              <p className="mt-3 text-sm text-(--color-fg-muted)">Connected to: {d.tools}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
