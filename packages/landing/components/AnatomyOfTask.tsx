'use client';

import { useEffect, useRef, useState } from 'react';
import { FadeIn } from './FadeIn';

type Step = {
  label: string;
  title: string;
  body: string;
  artifact: 'trigger' | 'context' | 'plan' | 'approval' | 'execute';
};

const steps: Step[] = [
  {
    label: 'Trigger',
    title: 'It starts where you do.',
    body: 'A line on your TODO list. A webhook from Sentry. A scheduled check. The agent picks it up the moment it lands.',
    artifact: 'trigger',
  },
  {
    label: 'Gather context',
    title: 'It reads the room.',
    body: 'Repo, logs, monitoring, related tickets — pulled in parallel. The agent shows its sources so you can trace its reasoning.',
    artifact: 'context',
  },
  {
    label: 'Plan',
    title: 'It drafts the change.',
    body: 'A concrete diff, scoped to the smallest fix. Tests written. The plan is reviewable before any tool is run.',
    artifact: 'plan',
  },
  {
    label: 'Your approval',
    title: 'You sign off.',
    body: 'Nothing irreversible runs without you. One click to ship, one to reject, one to ask for changes. Audit-logged either way.',
    artifact: 'approval',
  },
  {
    label: 'Execute',
    title: 'It ships.',
    body: 'PR merged. Channel notified. Status moved. The agent reports back in your inbox and the loop closes.',
    artifact: 'execute',
  },
];

function StepArtifact({ kind }: { kind: Step['artifact'] }) {
  if (kind === 'trigger') {
    return (
      <div className="rounded-(--radius-card) border border-(--color-warn)/40 bg-(--color-bg) px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-(--color-warn)">
            <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-warn)" />
          </span>
          <span className="flex-1 text-(--color-fg-muted)">annoying auth bug in prod - FIX ASAP</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-(--color-warn)/40 bg-(--color-warn)/10 px-2 py-0.5 text-xs font-medium text-(--color-warn)">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-warn)" />
            picked up
          </span>
        </div>
        <p className="mt-3 ml-9 text-xs uppercase tracking-wider text-(--color-fg-subtle)">
          source: your TODO list · 11:42 AM
        </p>
      </div>
    );
  }
  if (kind === 'context') {
    const sources = [
      { tool: 'GitHub', detail: 'repo: api · branches: main, fix/auth-*', tag: '3 files matched' },
      { tool: 'Sentry', detail: 'AuthTokenExpired · 412 events in 24h', tag: 'new since Tuesday' },
      { tool: 'PagerDuty', detail: 'incident #1841 · ack’d by you', tag: 'related' },
      { tool: 'Linear', detail: 'AUTH-122 · "session refresh edge case"', tag: 'open' },
    ];
    return (
      <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) p-5">
        <p className="text-xs uppercase tracking-wider text-(--color-fg-subtle)">Sources read</p>
        <ul className="mt-3 space-y-2">
          {sources.map((s) => (
            <li key={s.tool} className="flex items-center gap-3 rounded-md border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-sm">
              <span className="font-mono text-xs text-(--color-fg-subtle)">{s.tool}</span>
              <span className="flex-1 truncate text-(--color-fg-muted)">{s.detail}</span>
              <span className="shrink-0 text-xs text-(--color-fg-subtle)">{s.tag}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === 'plan') {
    return (
      <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) overflow-hidden">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-2 text-xs">
          <span className="font-mono text-(--color-fg-subtle)">src/auth/session.ts</span>
          <span className="text-(--color-success)">+12 −4</span>
        </div>
        <pre className="px-4 py-3 font-mono text-xs leading-relaxed text-(--color-fg-muted)">
{`  function refreshSession(token) {
-   if (token.expired) return null;
+   if (token.expired) {
+     return refreshFromCookie();
+   }
    return token;
  }`}
        </pre>
        <div className="border-t border-(--color-border) px-4 py-2 text-xs text-(--color-fg-subtle)">
          + 1 test added · session.test.ts
        </div>
      </div>
    );
  }
  if (kind === 'approval') {
    return (
      <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-(--color-fg-subtle)">Awaiting your sign-off</p>
          <span className="text-xs text-(--color-fg-subtle)">PR #432</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-(--color-fg)">fix: refresh stale session from cookie</p>
        <p className="mt-1 text-sm text-(--color-fg-muted)">
          Repro confirmed. Test added. No schema changes. Safe to merge to main.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="rounded-(--radius-button) bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-bg)">
            Approve & merge
          </button>
          <button className="rounded-(--radius-button) border border-(--color-border-strong) px-4 py-2 text-sm text-(--color-fg)">
            Request changes
          </button>
          <button className="rounded-(--radius-button) border border-(--color-border) px-4 py-2 text-sm text-(--color-fg-muted)">
            Reject
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-(--radius-card) border border-(--color-success)/30 bg-(--color-bg) p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--color-success)">
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-(--color-bg)" aria-hidden>
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-sm font-semibold text-(--color-success)">Merged · deployed to prod</p>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-(--color-fg-muted)">
        <li>✓ PR #432 merged to main</li>
        <li>✓ Slack #eng-on-call notified</li>
        <li>✓ Linear AUTH-122 closed</li>
        <li>✓ Audit log entry written</li>
      </ul>
    </div>
  );
}

export function AnatomyOfTask() {
  const [active, setActive] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let rafId: number | null = null;

    function update() {
      const center = window.innerHeight / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const d = Math.abs(cardCenter - center);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      });
      setActive(bestIndex);
    }

    function onScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section className="border-b border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn>
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">The anatomy of one task</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            One agent. One TODO. Five steps from your list to a merged PR.
          </h2>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-12 lg:gap-16">
          <div className="lg:sticky lg:top-32 self-start">
            <ul className="space-y-3">
              {steps.map((s, i) => {
                const isActive = active === i;
                const isPast = active > i;
                return (
                  <li key={s.label} className="flex items-start gap-4">
                    <span
                      className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-300 ${
                        isPast
                          ? 'border-(--color-success) bg-(--color-success) text-(--color-bg)'
                          : isActive
                            ? 'border-(--color-accent) bg-(--color-accent) text-(--color-bg)'
                            : 'border-(--color-border) text-(--color-fg-subtle)'
                      }`}
                    >
                      {isPast ? (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium uppercase tracking-wider transition-colors duration-300 ${
                          isActive ? 'text-(--color-fg)' : 'text-(--color-fg-subtle)'
                        }`}
                      >
                        {s.label}
                      </p>
                      <p
                        className={`mt-1 text-base transition-colors duration-300 ${
                          isActive ? 'text-(--color-fg)' : 'text-(--color-fg-subtle)'
                        }`}
                      >
                        {steps[i].title}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-12">
            {steps.map((s, i) => {
              const isActive = active === i;
              return (
                <div
                  key={s.label}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className={`transition-all duration-500 ${isActive ? 'opacity-100 scale-[1.01]' : 'opacity-40 scale-100'}`}
                >
                  <p className="text-xs uppercase tracking-wider text-(--color-fg-subtle) mb-2">
                    Step {i + 1} · {s.label}
                  </p>
                  <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-(--color-fg-muted) leading-relaxed">{s.body}</p>
                  <div className="mt-6">
                    <StepArtifact kind={s.artifact} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
