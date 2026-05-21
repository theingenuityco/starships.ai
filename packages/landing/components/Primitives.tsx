import { FadeIn } from './FadeIn';

type Primitive = {
  name: string;
  oneliner: string;
  body: string;
  visual: 'goals' | 'heartbeats' | 'docs' | 'data';
};

const primitives: Primitive[] = [
  {
    name: 'Goals',
    oneliner: 'Outcomes, not tickets.',
    body: 'Each room is anchored to a goal. Agents pick their own work toward it, and report when they are blocked.',
    visual: 'goals',
  },
  {
    name: 'Heartbeats',
    oneliner: 'Pulses that wake agents up.',
    body: 'Schedules and triggers tell agents when to look. Every morning. Every push. Every new lead. Every dashboard anomaly.',
    visual: 'heartbeats',
  },
  {
    name: 'Docs',
    oneliner: 'Your handbook, read by every agent.',
    body: 'Runbooks, brand voice, escalation policies. Agents read them like a new hire, and follow them like a careful one.',
    visual: 'docs',
  },
  {
    name: 'Data',
    oneliner: 'Live access to your real systems.',
    body: 'Postgres, warehouse, internal APIs. Agents query the same data your team does. Read-only by default, write with approval.',
    visual: 'data',
  },
];

function GoalsVisual() {
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg) p-3 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Goal · Engineering room</p>
      <p className="mt-1 text-sm text-(--color-fg)">Keep main green and deploy weekly.</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-(--color-border)">
        <div className="h-full w-3/4 bg-(--color-success)" />
      </div>
      <p className="mt-1.5 text-[10px] text-(--color-fg-subtle)">12 of 16 PRs merged this week</p>
    </div>
  );
}

function HeartbeatsVisual() {
  const beats = [
    { when: 'every morning at 8am', who: 'Status Reporter', what: 'post daily summary' },
    { when: 'on push to main', who: 'Security Scanner', what: 'scan diff' },
    { when: 'when latency spikes', who: 'Anomaly Watcher', what: 'notify on-call' },
  ];
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg) p-3 text-xs font-mono space-y-2">
      {beats.map((b) => (
        <div key={b.who}>
          <p className="text-(--color-fg-subtle)">{b.when}</p>
          <p className="text-(--color-fg)">
            → <span className="text-(--color-accent)">{b.who}</span>: {b.what}
          </p>
        </div>
      ))}
    </div>
  );
}

function DocsVisual() {
  const docs = ['Brand voice guide', 'Incident runbook', 'Pricing principles', 'Escalation matrix'];
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg) p-3 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
      <ul className="mt-2 space-y-1.5">
        {docs.map((d) => (
          <li key={d} className="flex items-center gap-2 text-(--color-fg-muted)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-success)" />
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataVisual() {
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg) p-3 font-mono text-xs">
      <p className="text-(--color-fg-subtle)">SELECT sum(mrr) FROM stripe.subscriptions</p>
      <p className="text-(--color-fg-subtle)">WHERE status = &lsquo;active&rsquo; …</p>
      <p className="mt-2 text-lg font-semibold text-(--color-success)">$248,140</p>
      <p className="mt-1 text-[10px] text-(--color-fg-subtle)">read-only · audited · 0.4s</p>
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
    <section className="border-b border-(--color-border) bg-(--color-bg-elev)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <FadeIn>
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">How it actually works</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            Built from primitives, not prompts.
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            A virtual org is more than chat. It runs on the same primitives your real org does, only made first-class for agents.
          </p>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4">
          {primitives.map((p, i) => (
            <FadeIn key={p.name} delay={i * 80}>
              <div className="h-full rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) p-6">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                  <span className="text-sm text-(--color-fg-subtle)">{p.oneliner}</span>
                </div>
                <p className="mt-3 text-(--color-fg-muted) leading-relaxed">{p.body}</p>
                <div className="mt-5">{visuals[p.visual]}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
