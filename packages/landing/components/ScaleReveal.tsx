'use client';

import { useEffect, useState } from 'react';
import { FadeIn } from './FadeIn';

type Activity = {
  tool: string;
  verb: string;
  object: string;
  state: 'working' | 'done' | 'needs-you';
  span?: 'wide' | 'normal';
};

const activities: Activity[] = [
  { tool: 'GitHub', verb: 'opened', object: 'PR #432 · fix auth refresh', state: 'needs-you', span: 'wide' },
  { tool: 'LinkedIn', verb: 'researching', object: 'Acme Co · 14 contacts', state: 'working' },
  { tool: 'Zendesk', verb: 'resolved', object: 'ticket #2018 · refund', state: 'done' },
  { tool: 'Notion', verb: 'drafted', object: 'pricing scenario v3', state: 'done' },
  { tool: 'Mailchimp', verb: 'queued', object: 'campaign · 4 segments', state: 'working' },
  { tool: 'GitHub', verb: 'reviewed', object: 'PR #428 · approved', state: 'done' },
  { tool: 'Stripe', verb: 'retried', object: 'invoice INV-1240', state: 'done' },
  { tool: 'Linear', verb: 'closed', object: 'AUTH-122', state: 'done' },
  { tool: 'Calendar', verb: 'booked', object: 'interview · Thu 3pm', state: 'done', span: 'wide' },
  { tool: 'Gmail', verb: 'drafted', object: 'reply to investor', state: 'needs-you' },
  { tool: 'HubSpot', verb: 'synced', object: '12 contacts updated', state: 'done' },
  { tool: 'Datadog', verb: 'flagged', object: 'latency spike · /api', state: 'needs-you' },
  { tool: 'Slack', verb: 'summarised', object: '#design · last 24h', state: 'done' },
  { tool: 'Sentry', verb: 'triaged', object: '5 new errors', state: 'working' },
  { tool: 'Apollo', verb: 'enriched', object: '38 leads', state: 'done' },
  { tool: 'GitHub', verb: 'wrote', object: 'tests for billing.ts', state: 'working' },
  { tool: 'Docs', verb: 'updated', object: '/api/auth · v2', state: 'done' },
  { tool: 'Calendly', verb: 'rescheduled', object: 'demo · Broke Inc', state: 'done' },
  { tool: 'Postgres', verb: 'snapshot', object: 'staging · nightly', state: 'done' },
  { tool: 'Vercel', verb: 'deployed', object: 'preview · main', state: 'done' },
  { tool: 'Brex', verb: 'tagged', object: '14 expenses', state: 'done' },
  { tool: 'Figma', verb: 'exported', object: 'icons · web/v3', state: 'done' },
];

function StateDot({ state }: { state: Activity['state'] }) {
  if (state === 'done') return <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-success)" />;
  if (state === 'working') return <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-warn)" />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)" />;
}

function ActivityCard({ a, index, livePulse }: { a: Activity; index: number; livePulse: boolean }) {
  return (
    <div
      className={`group rounded-(--radius-card) border bg-(--color-bg-elev) px-4 py-3 transition-colors duration-700 ${
        a.span === 'wide' ? 'sm:col-span-2' : ''
      } ${
        a.state === 'needs-you'
          ? 'border-(--color-accent)/30'
          : a.state === 'working'
            ? 'border-(--color-warn)/30'
            : 'border-(--color-border)'
      } ${livePulse ? 'ring-1 ring-(--color-success)/40' : ''}`}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">
        <StateDot state={a.state} />
        <span className="font-mono">{a.tool}</span>
        <span className="ml-auto">
          {a.state === 'needs-you' ? 'needs you' : a.state === 'working' ? 'working' : 'done'}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-snug">
        <span className="text-(--color-fg-muted)">{a.verb} </span>
        <span className="text-(--color-fg)">{a.object}</span>
      </p>
    </div>
  );
}

export function ScaleReveal() {
  const [pulseIndex, setPulseIndex] = useState<number | null>(null);

  useEffect(() => {
    const candidates = activities.map((a, i) => (a.state === 'working' ? i : -1)).filter((i) => i >= 0);
    if (!candidates.length) return;
    const interval = setInterval(() => {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      setPulseIndex(pick);
      setTimeout(() => setPulseIndex(null), 1600);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative border-b border-(--color-border) bg-(--color-bg) overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, rgba(231, 236, 243, 0.05), transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-6 py-28">
        <FadeIn>
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Now multiply that</p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-4xl">
            One of you. <span className="text-(--color-fg-muted)">Thirty of them.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Your virtual org, working in parallel across every tool you already use. This is a single hour.
          </p>
        </FadeIn>

        <FadeIn delay={120} className="mt-14">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 [grid-auto-flow:dense]">
            {activities.map((a, i) => (
              <ActivityCard key={`${a.tool}-${i}`} a={a} index={i} livePulse={pulseIndex === i} />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between text-xs text-(--color-fg-subtle)">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-success)" /> done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-warn)" /> working
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" /> needs you
              </span>
            </div>
            <span className="font-mono">22 of 47 surfaces shown</span>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
