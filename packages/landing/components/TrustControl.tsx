'use client';

import { useEffect, useState } from 'react';
import { FadeIn } from './FadeIn';

type QueueItem = {
  kind: string;
  title: string;
  preview: string;
  meta: string;
};

const items: QueueItem[] = [
  {
    kind: 'PR merge',
    title: 'fix: refresh stale session from cookie',
    preview: '+12 −4 · src/auth/session.ts · 1 test added',
    meta: 'Engineering room · 11:42 AM',
  },
  {
    kind: 'Email send',
    title: 'Follow-up to Broke Inc on payments',
    preview: 'Hi Sam — circling back on the contract. We can…',
    meta: 'Sales room · 11:38 AM',
  },
  {
    kind: 'Invoice retry',
    title: 'Charge $4,200 · INV-1240 · Stripe',
    preview: 'Card declined 2× · customer notified Tuesday',
    meta: 'Ops room · 11:35 AM',
  },
];

const pillars = [
  {
    icon: '🔒',
    title: 'Nothing irreversible without you.',
    body: 'Sends, merges, payments, deploys — every real-world action lands in your queue first.',
  },
  {
    icon: '📜',
    title: 'Every action audit-logged.',
    body: 'Who proposed it, what changed, when you approved it, and the full chain of reasoning behind it.',
  },
  {
    icon: '⏸',
    title: 'Halt anything, instantly.',
    body: 'Per-agent, per-room, or org-wide kill switch. Pause an agent without losing its in-flight work.',
  },
];

export function TrustControl() {
  const [approvedIndex, setApprovedIndex] = useState<number | null>(null);

  useEffect(() => {
    const loop = setInterval(() => {
      setApprovedIndex(0);
      setTimeout(() => setApprovedIndex(null), 1800);
    }, 5200);
    return () => clearInterval(loop);
  }, []);

  return (
    <section className="border-b border-(--color-border) bg-(--color-bg-soft)">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div>
          <FadeIn as="p" className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4" delay={0}>
            Always your call
          </FadeIn>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            <FadeIn as="span" className="block" delay={90}>
              You are in full control.
            </FadeIn>
            <FadeIn as="span" className="block text-(--color-fg-muted)" delay={180}>
              Every action, your sign-off.
            </FadeIn>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-12 lg:gap-16 items-start">
          <div className="space-y-6">
            {pillars.map((p, i) => (
              <FadeIn
                key={p.title}
                delay={i * 90}
                className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-xl leading-none">{p.icon}</span>
                  <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                </div>
                <p className="mt-3 text-(--color-fg-muted) leading-relaxed">{p.body}</p>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={140}>
            <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) overflow-hidden shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-(--color-accent)" />
                  <span className="text-sm font-semibold">Approval queue</span>
                </div>
                <span className="text-xs text-(--color-fg-subtle)">{items.length} awaiting sign-off</span>
              </div>

              <ul>
                {items.map((it, i) => {
                  const isApproved = approvedIndex === i;
                  return (
                    <li
                      key={it.title}
                      className={`border-b border-(--color-border) last:border-b-0 px-5 py-4 transition-colors duration-500 ${
                        isApproved ? 'bg-(--color-success)/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-(--color-fg-subtle)">
                          <span className="font-mono">{it.kind}</span>
                        </span>
                        <span
                          className={`text-xs transition-colors duration-500 ${
                            isApproved ? 'text-(--color-success)' : 'text-(--color-fg-subtle)'
                          }`}
                        >
                          {isApproved ? '✓ approved' : it.meta}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-(--color-fg)">{it.title}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-(--color-fg-muted)">{it.preview}</p>

                      <div className="mt-3 flex gap-2">
                        <button
                          className={`rounded-(--radius-button) px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                            isApproved
                              ? 'bg-(--color-success) text-(--color-bg)'
                              : 'bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-strong)'
                          }`}
                        >
                          {isApproved ? 'Approved' : 'Approve'}
                        </button>
                        <button className="rounded-(--radius-button) border border-(--color-border-strong) px-3 py-1.5 text-xs text-(--color-fg)">
                          Request changes
                        </button>
                        <button className="rounded-(--radius-button) border border-(--color-border) px-3 py-1.5 text-xs text-(--color-fg-muted)">
                          Reject
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-(--color-border) px-5 py-3 flex items-center justify-between text-xs text-(--color-fg-subtle)">
                <span className="font-mono">audit log · 1,284 entries this week</span>
                <a href="#" className="text-(--color-fg-muted) hover:text-(--color-fg)">View all →</a>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
