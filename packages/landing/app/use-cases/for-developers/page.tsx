import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';

export const metadata: Metadata = {
  title: 'Engineering — Starships',
  description: 'Autonomous agents for code review, test authoring, security scanning, and dependency management.',
};

export const dynamic = 'force-static';

const agents = [
  {
    name: 'PR Reviewer',
    trigger: 'On every pull request',
    description:
      'Reads the diff, understands context from the codebase docs, leaves structured review comments, and flags anything that looks wrong — before a human even opens it.',
  },
  {
    name: 'Test Author',
    trigger: 'On every new feature commit',
    description:
      'Reads the changed files, generates test cases covering the happy path and the edge cases, and opens a PR with the new test file. Your coverage goes up without anyone writing boilerplate.',
  },
  {
    name: 'Security Scanner',
    trigger: 'On every push to main',
    description:
      'Scans the diff for known vulnerability patterns, CVEs in dependencies, and common security anti-patterns. Posts a summary to the Engineering room and escalates anything critical immediately.',
  },
  {
    name: 'Dependency Upgrader',
    trigger: 'Weekly, every Monday',
    description:
      'Checks for outdated packages, reads the changelogs, groups safe patch and minor upgrades into a single PR, and flags major-version bumps that need your attention.',
  },
];

const primitives = [
  {
    name: 'Goals.',
    body: 'Set a goal for the Engineering room — "keep main green, ship weekly." Agents break it into tasks: review #432, patch lodash, write the billing tests. You see the board. They do the work.',
    visual: (
      <div className="w-full overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
        <div className="border-b border-(--color-border) bg-(--color-bg-soft) px-3.5 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <Icon name="layout" className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
            <span className="flex-1 truncate text-xs font-semibold text-(--color-fg)">Engineering room</span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--color-fg-subtle)">2/5</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-(--color-fg-muted)">Keep main green. Ship weekly.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full rounded-full bg-(--color-success)" style={{ width: '40%' }} />
          </div>
        </div>
        <div className="space-y-px p-2">
          {[
            { title: 'Merge auth refactor PR #432', done: false, col: 'In review' },
            { title: 'Fix flaky billing test', done: true },
            { title: 'Upgrade Next.js to 16', done: false, col: 'In progress' },
            { title: 'Patch CVE in lodash dep', done: true },
            { title: 'Cut the weekly release', done: false, col: 'Todo' },
          ].map((t) => (
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
              {!t.done && t.col ? (
                <span className="shrink-0 rounded-full border border-(--color-border) px-1.5 py-px text-[10px] text-(--color-fg-subtle)">
                  {t.col}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    name: 'Heartbeats.',
    body: 'Tell each agent when to act. PR Reviewer fires on every pull request. Security Scanner fires on every push. Dependency Upgrader fires every Monday at 9am. No polling, no cron scripts, no if-this-then-that.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { who: 'PR Reviewer', when: 'on every pull request', next: 'on PR', sub: 'live' },
          { who: 'Security Scanner', when: 'on every push to main', next: 'on push', sub: 'live' },
          { who: 'Anomaly Watcher', when: 'when p95 latency > 500ms', next: 'on alert', sub: 'armed' },
          { who: 'Dependency Upgrader', when: 'every Monday at 9:00am', next: '9:00 AM', sub: 'Monday' },
        ].map((b) => (
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
          </div>
        ))}
      </div>
    ),
  },
  {
    name: 'Docs.',
    body: 'Upload your coding standards, your PR template, your architecture decision records. Every agent reads them before acting. The PR Reviewer respects your conventions without you having to brief it.',
    visual: (
      <div className="w-full space-y-2">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
          <p className="font-mono text-[10px] text-(--color-fg-subtle)">4 docs · synced</p>
        </div>
        {['Coding standards', 'PR review template', 'Architecture decisions', 'Security checklist'].map((d) => (
          <div key={d} className="flex items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-4 py-3">
            <Icon name="file-text" className="h-4 w-4 shrink-0 text-(--color-fg-subtle)" />
            <span className="text-sm font-medium text-(--color-fg)">{d}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    name: 'Data.',
    body: 'Connect your GitHub, error tracker, and metrics stack. Agents query what they need. The Security Scanner reads the CVE feed. The Anomaly Watcher reads your p95 latency. Read-only by default — they ask before writing anything.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { name: 'GitHub', desc: 'Pull requests, commits, diffs', slug: 'github' },
          { name: 'Sentry', desc: 'Errors and stack traces', slug: 'sentry' },
          { name: 'Datadog', desc: 'Metrics and latency', slug: 'datadog' },
        ].map((d) => (
          <div
            key={d.slug}
            className="flex items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-4 py-3"
          >
            <img src={`/integrations/${d.slug}.svg`} alt={d.name} className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-(--color-fg)">{d.name}</p>
              <p className="text-xs text-(--color-fg-subtle)">{d.desc}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-(--color-success)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-success)">
              read-only
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function ForDevelopersPage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 pt-44 pb-24 sm:pt-52 sm:pb-32">
          <FadeIn delay={40}>
            <p className="flex items-center gap-1.5 text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase">
              <Link href="/use-cases" className="inline-flex items-center gap-1 hover:text-(--color-fg) transition-colors">
                <Icon name="arrow-left" className="h-3 w-3" />Use Cases
              </Link>
              <span>/</span>
              <span>Engineering Room</span>
            </p>
          </FadeIn>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            <FadeIn as="span" delay={80} className="block">
              Your codebase has a
            </FadeIn>
            <FadeIn as="span" delay={160} className="block">
              maintenance problem.
            </FadeIn>
            <FadeIn as="span" delay={240} className="block text-(--color-fg-muted)">
              Starships fixes it.
            </FadeIn>
          </h1>
          <FadeIn delay={320}>
            <p className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
              PR reviews that never block. Tests written before you ask. Dependencies upgraded before they become a problem.
              Security scans on every push. The Engineering room runs 24 hours a day so your engineers can focus on the product.
            </p>
          </FadeIn>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <FadeIn delay={400}>
              <a
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
              >
                Request demo
                <Icon name="arrow-right" className="h-4 w-4" />
              </a>
            </FadeIn>
            <FadeIn delay={460}>
              <a
                href="mailto:hello@starships.ai"
                className="inline-flex items-center justify-center rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-elev) transition-colors"
              >
                hello@starships.ai
              </a>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <FadeIn>
            <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Your engineering crew</p>
          </FadeIn>
          <FadeIn delay={60}>
            <h2 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">
              Four agents. One room. Infinite leverage.
            </h2>
          </FadeIn>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {agents.map((a, i) => (
              <FadeIn key={a.name} delay={80 + i * 80}>
                <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6 h-full">
                  <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-3">{a.trigger}</p>
                  <h3 className="text-lg font-semibold">{a.name}</h3>
                  <p className="mt-3 text-(--color-fg-muted) leading-relaxed text-[15px]">{a.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Primitives */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <FadeIn>
            <h2 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">The primitives behind it.</h2>
          </FadeIn>
          <FadeIn delay={60}>
            <p className="mt-4 text-lg text-(--color-fg-muted)">Every agent in the Engineering room is built on four primitives you control.</p>
          </FadeIn>
          <div className="mt-20 space-y-24">
            {primitives.map((p, i) => (
              <div key={p.name} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <FadeIn>
                    <h3 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">{p.name}</h3>
                  </FadeIn>
                  <FadeIn delay={90}>
                    <p className="mt-6 max-w-md text-lg text-(--color-fg-muted) leading-relaxed">{p.body}</p>
                  </FadeIn>
                </div>
                <FadeIn delay={180} className={i % 2 === 1 ? 'lg:order-1' : ''}>
                  {p.visual}
                </FadeIn>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrustControl />

      {/* Final CTA */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
          <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            <FadeIn as="span" delay={0} className="block text-(--color-fg-muted)">
              Your engineers should be
            </FadeIn>
            <FadeIn as="span" delay={90} className="block text-6xl sm:text-7xl md:text-8xl">
              building,
            </FadeIn>
            <FadeIn as="span" delay={180} className="block text-6xl sm:text-7xl md:text-8xl">
              not babysitting.
            </FadeIn>
          </h2>
          <FadeIn as="p" delay={270} className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Tell us how your team works. We&rsquo;ll configure the Engineering room and hand you the keys.
          </FadeIn>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <FadeIn delay={360}>
              <a
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
              >
                Request demo
                <Icon name="arrow-right" className="h-4 w-4" />
              </a>
            </FadeIn>
            <FadeIn delay={440}>
              <a
                href="mailto:hello@starships.ai"
                className="inline-flex items-center justify-center rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-elev) transition-colors"
              >
                hello@starships.ai
              </a>
            </FadeIn>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
