import { FadeIn } from './FadeIn';

type Primitive = {
  name: string;
  body: string;
  visual: 'goals' | 'heartbeats' | 'docs' | 'data';
};

const primitives: Primitive[] = [
  {
    name: 'Goals',
    body: 'Each room is anchored to a goal. Agents pick their own work toward it, and report when they are blocked.',
    visual: 'goals',
  },
  {
    name: 'Heartbeats',
    body: 'Schedules and triggers tell agents when to look. Every morning. Every push. Every new lead. Every dashboard anomaly.',
    visual: 'heartbeats',
  },
  {
    name: 'Docs',
    body: 'Runbooks, brand voice, escalation policies. Agents read them like a new hire, and follow them like a careful one.',
    visual: 'docs',
  },
  {
    name: 'Data',
    body: 'Postgres, warehouse, internal APIs. Agents query the same data your team does. Read-only by default, write with approval.',
    visual: 'data',
  },
];

function GoalsVisual() {
  const goals = [
    { room: 'Engineering', goal: 'Keep main green. Ship weekly.', progress: 75, detail: '12 of 16 PRs merged' },
    { room: 'Sales', goal: 'Build pipeline at 4× leverage.', progress: 60, detail: '24 of 40 leads qualified' },
    { room: 'Ops', goal: 'Zero overdue tickets at EOD.', progress: 90, detail: '3 of 30 pending' },
  ];
  return (
    <div className="w-full space-y-3">
      {goals.map((g) => (
        <div key={g.room} className="rounded-md border border-(--color-border) bg-(--color-bg-elev) p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">{g.room} room</p>
            <p className="font-mono text-xs text-(--color-success)">{g.progress}%</p>
          </div>
          <p className="mt-1 text-sm text-(--color-fg)">{g.goal}</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full bg-(--color-success)" style={{ width: `${g.progress}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-[10px] text-(--color-fg-subtle)">{g.detail}</p>
        </div>
      ))}
    </div>
  );
}

function HeartbeatsVisual() {
  const beats = [
    { when: 'every morning at 8am', who: 'Status Reporter', what: 'post daily summary to #ops' },
    { when: 'every push to main', who: 'Security Scanner', what: 'scan diff for vulnerabilities' },
    { when: 'when latency > 500ms', who: 'Anomaly Watcher', what: 'page on-call immediately' },
    { when: 'every new lead', who: 'Account Researcher', what: 'enrich and assign to AE' },
  ];
  return (
    <div className="w-full space-y-2.5">
      {beats.map((b) => (
        <div key={b.who} className="rounded-md border border-(--color-border) bg-(--color-bg-elev) p-3 font-mono text-xs">
          <p className="text-(--color-fg-subtle)">{b.when}</p>
          <p className="mt-1 text-(--color-fg)">
            → <span className="text-(--color-accent)">{b.who}</span>: {b.what}
          </p>
        </div>
      ))}
    </div>
  );
}

function DocsVisual() {
  const docs = [
    { name: 'Brand voice guide', updated: '2 days ago' },
    { name: 'Incident response runbook', updated: '1 week ago' },
    { name: 'Pricing principles', updated: '3 weeks ago' },
    { name: 'Escalation matrix', updated: '1 month ago' },
    { name: 'Customer tone of voice', updated: '2 months ago' },
  ];
  return (
    <div className="w-full rounded-md border border-(--color-border) bg-(--color-bg-elev) p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
        <p className="font-mono text-[10px] text-(--color-fg-subtle)">24 docs · synced</p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {docs.map((d) => (
          <li key={d.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2.5 text-(--color-fg-muted)">
              <span className="h-1.5 w-1.5 rounded-full bg-(--color-success)" />
              {d.name}
            </div>
            <span className="font-mono text-xs text-(--color-fg-subtle)">{d.updated}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataVisual() {
  return (
    <div className="w-full space-y-3">
      <div className="rounded-md border border-(--color-border) bg-(--color-bg-elev) p-4 font-mono text-xs">
        <p className="text-(--color-fg-subtle)">SELECT sum(mrr) FROM stripe.subscriptions</p>
        <p className="text-(--color-fg-subtle)">WHERE status = &lsquo;active&rsquo;</p>
        <p className="mt-4 text-3xl font-semibold text-(--color-success)">$248,140</p>
        <p className="mt-1 text-[10px] text-(--color-fg-subtle)">read-only · audited · 0.4s</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['postgres', 'stripe', 'datadog'].map((s) => (
          <div
            key={s}
            className="rounded border border-(--color-border) bg-(--color-bg-elev) px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-(--color-fg-subtle)"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

const visuals: Record<Primitive['visual'], React.ReactNode> = {
  goals: <GoalsVisual />,
  heartbeats: <HeartbeatsVisual />,
  docs: <DocsVisual />,
  data: <DataVisual />,
};

export function Primitives() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          <FadeIn as="span" className="block" delay={0}>
            Built from primitives,
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
            not prompts.
          </FadeIn>
        </h2>

        <div className="mt-24 sm:mt-32 space-y-24 sm:space-y-32">
          {primitives.map((p, i) => (
            <FadeIn key={p.name} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <h3 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">{p.name}.</h3>
                <p className="mt-6 max-w-md text-lg text-(--color-fg-muted) leading-relaxed">{p.body}</p>
              </div>
              <div className={i % 2 === 1 ? 'lg:order-1' : ''}>{visuals[p.visual]}</div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
