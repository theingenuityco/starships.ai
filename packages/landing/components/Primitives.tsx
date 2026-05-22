'use client';

import { useEffect, useRef } from 'react';
import { FadeIn } from './FadeIn';
import { Icon } from './Icon';

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
  const tasks: { title: string; done: boolean; column?: string }[] = [
    { title: 'Merge auth refactor PR #432', done: false, column: 'In review' },
    { title: 'Fix flaky billing test', done: true },
    { title: 'Upgrade Next.js to 16', done: false, column: 'In progress' },
    { title: 'Patch CVE in lodash dep', done: true },
    { title: 'Cut the weekly release', done: false, column: 'Todo' },
  ];
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="w-full overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
      {/* Board header — room, goal and progress, mirroring the dashboard goals column */}
      <div className="border-b border-(--color-border) bg-(--color-bg-soft) px-3.5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="layout" className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
          <span className="flex-1 truncate text-xs font-semibold text-(--color-fg)">Engineering room</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--color-fg-subtle)">
            {done}/{total}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-(--color-fg-muted)">Keep main green. Ship weekly.</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
          <div className="h-full rounded-full bg-(--color-success)" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {/* Checklist of work toward the goal */}
      <div className="space-y-px p-2">
        {tasks.map((t) => (
          <div key={t.title} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                t.done ? 'border-(--color-success) bg-(--color-success)' : 'border-(--color-border)'
              }`}
            >
              {t.done ? <Icon name="check" className="h-2 w-2 text-(--color-bg)" /> : null}
            </span>
            <span
              className={`flex-1 truncate text-xs leading-snug ${
                t.done ? 'text-(--color-fg-subtle) line-through' : 'text-(--color-fg)'
              }`}
            >
              {t.title}
            </span>
            {!t.done && t.column ? (
              <span className="shrink-0 rounded-full border border-(--color-border) px-1.5 py-px text-[10px] text-(--color-fg-subtle)">
                {t.column}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeartbeatsVisual() {
  const beats = [
    { who: 'Status Reporter', when: 'every morning at 8:00am', what: 'Post daily summary to #ops', next: '8:00 AM', sub: 'tomorrow' },
    { who: 'Security Scanner', when: 'on every push to main', what: 'Scan the diff for vulnerabilities', next: 'on push', sub: 'live' },
    { who: 'Anomaly Watcher', when: 'when p95 latency > 500ms', what: 'Page the on-call immediately', next: 'on alert', sub: 'armed' },
    { who: 'Account Researcher', when: 'on every new lead', what: 'Enrich and assign to an AE', next: 'on event', sub: 'live' },
  ];
  return (
    <div className="w-full space-y-2">
      {beats.map((b) => (
        <div key={b.who} className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--color-accent-soft) text-[11px] font-medium text-(--color-fg)">
                {b.who.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-(--color-fg)">{b.who}</div>
                <div className="truncate text-[10px] text-(--color-fg-subtle)">{b.when}</div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-medium text-(--color-fg)">{b.next}</div>
              <div className="text-[10px] text-(--color-fg-subtle)">{b.sub}</div>
            </div>
          </div>
          <p className="mt-1 truncate text-[10px] text-(--color-fg-muted)">{b.what}</p>
        </div>
      ))}
    </div>
  );
}

function DocsVisual() {
  const docs = [
    { name: 'Brand voice guide', slug: 'brand-voice-guide', updated: '2 days ago' },
    { name: 'Incident response runbook', slug: 'incident-response', updated: '1 week ago' },
    { name: 'Pricing principles', slug: 'pricing-principles', updated: '3 weeks ago' },
    { name: 'Escalation matrix', slug: 'escalation-matrix', updated: '1 month ago' },
    { name: 'Customer tone of voice', slug: 'tone-of-voice', updated: '2 months ago' },
  ];
  return (
    <div className="w-full">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
        <p className="font-mono text-[10px] text-(--color-fg-subtle)">24 docs · synced</p>
      </div>
      <div className="space-y-2">
        {docs.map((d) => (
          <div
            key={d.slug}
            className="flex items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-4 py-3"
          >
            <Icon name="file-text" className="h-4 w-4 shrink-0 text-(--color-fg-subtle)" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-(--color-fg)">{d.name}</p>
              <p className="truncate text-xs text-(--color-fg-subtle)">{d.slug}</p>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-(--color-fg-subtle)">{d.updated}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataVisual() {
  const datasets = [
    { name: 'Stripe subscriptions', slug: 'stripe_subscriptions', desc: 'Billing + revenue', cols: 18 },
    { name: 'Product events', slug: 'warehouse.events', desc: 'Warehouse event stream', cols: 42 },
  ];
  return (
    <div className="w-full space-y-3">
      {/* Dataset rows, mirroring the datasets list in the app */}
      <div className="space-y-2">
        {datasets.map((d) => (
          <div
            key={d.slug}
            className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--color-bg-soft) ring-1 ring-(--color-border)">
                <Icon name="database" className="h-5 w-5 text-(--color-fg-muted)" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-(--color-fg)">{d.name}</span>
                  <code className="truncate font-mono text-[11px] text-(--color-fg-subtle)">{d.slug}</code>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-(--color-fg-subtle)">
                  <span className="truncate">{d.desc}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{d.cols} columns</span>
                </div>
              </div>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-(--radius-button) px-2 py-1 text-xs text-(--color-fg-muted) sm:inline-flex">
              <Icon name="arrow-right" className="h-4 w-4" />
              Open
            </span>
          </div>
        ))}
      </div>
      {/* Agents query the same data your team does */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4 font-mono text-xs">
        <p className="text-(--color-fg-subtle)">SELECT sum(mrr) FROM stripe_subscriptions</p>
        <p className="text-(--color-fg-subtle)">WHERE status = &lsquo;active&rsquo;</p>
        <p className="mt-4 text-3xl font-semibold text-(--color-success)">$248,140</p>
        <p className="mt-1 text-[10px] text-(--color-fg-subtle)">read-only · audited · 0.4s</p>
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

function PrimitiveRow({ p, i }: { p: Primitive; i: number }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const compRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = titleRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          for (const el of [titleRef.current, descRef.current, compRef.current]) {
            if (el) {
              el.classList.remove('fade-will-animate');
              el.classList.add('animate-fade-up');
            }
          }
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -120px 0px' }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
        <h3
          ref={titleRef}
          className="fade-will-animate text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl"
          style={{ '--delay': '0ms' } as React.CSSProperties}
        >
          {p.name}.
        </h3>
        <p
          ref={descRef}
          className="fade-will-animate mt-6 max-w-md text-lg text-(--color-fg-muted) leading-relaxed"
          style={{ '--delay': '90ms' } as React.CSSProperties}
        >
          {p.body}
        </p>
      </div>
      <div
        ref={compRef}
        className={`fade-will-animate ${i % 2 === 1 ? 'lg:order-1' : ''}`}
        style={{ '--delay': '180ms' } as React.CSSProperties}
      >
        {visuals[p.visual]}
      </div>
    </div>
  );
}

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
            <PrimitiveRow key={p.name} p={p} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
