import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';
import { UseCasesScroller } from '@/components/UseCasesScroller';

export const metadata: Metadata = {
  title: 'Engineering — Starships',
  description: 'Autonomous agents for code review, test authoring, security scanning, and dependency management.',
};

export const dynamic = 'force-static';

const useCases = [
  {
    situation: 'A PR opens after hours',
    headline: 'Reviewed before anyone wakes up.',
    description:
      'PR Reviewer reads the diff, checks it against your coding standards, leaves structured comments, and flags anything suspicious. Your engineers open to a pre-reviewed PR.',
  },
  {
    situation: 'A new feature lands',
    headline: 'Tests written. Coverage up.',
    description:
      'Test Author reads the changed files, generates test cases for the happy path and the edge cases, and opens a PR with the test file. No boilerplate, no reminders needed.',
  },
  {
    situation: 'A dependency is out of date',
    headline: 'Upgraded before it becomes a problem.',
    description:
      'Dependency Upgrader reads the changelogs, groups safe patch and minor bumps into a single PR, and flags major-version changes that need your attention. Every Monday.',
  },
];

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

function StatusBadge({ label, tone = 'success' }: { label: string; tone?: 'success' | 'warn' }) {
  const isWarn = tone === 'warn';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        isWarn
          ? 'border-(--color-warn)/40 bg-(--color-warn)/10 text-(--color-warn)'
          : 'border-(--color-success)/40 bg-(--color-success)/10 text-(--color-success)'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isWarn ? 'animate-pulse bg-(--color-warn)' : 'bg-(--color-success)'}`} />
      {label}
    </span>
  );
}

// Mock artifact each agent produces — shows the output, not just describes it.
function MockVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
        <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="git-branch" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="text-sm font-semibold text-(--color-fg)">#432 auth refactor</span>
          </div>
          <StatusBadge label="reviewed" />
        </div>
        <div className="flex items-center gap-3 border-b border-(--color-border) px-4 py-2.5 font-mono text-xs">
          <span className="text-(--color-success)">+142</span>
          <span className="text-(--color-warn)">−38</span>
          <span className="text-(--color-fg-subtle)">6 files</span>
        </div>
        <div className="space-y-2.5 p-4 text-sm">
          {[
            { tone: 'ok', text: 'Token rotation looks correct' },
            { tone: 'warn', text: 'Missing null check on line 88' },
            { tone: 'ok', text: 'Edge cases are covered' },
          ].map((c) => (
            <div key={c.text} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  c.tone === 'warn' ? 'bg-(--color-warn)/15 text-(--color-warn)' : 'bg-(--color-success)/15 text-(--color-success)'
                }`}
              >
                {c.tone === 'warn' ? '!' : <Icon name="check" className="h-2.5 w-2.5" />}
              </span>
              <span className="text-(--color-fg-muted)">{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
        <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="file-text" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="font-mono text-sm font-semibold text-(--color-fg)">billing.test.ts</span>
          </div>
          <StatusBadge label="opened PR" />
        </div>
        <div className="space-y-1 p-4 font-mono text-xs">
          <p className="text-(--color-success)">+ describe(&lsquo;charges&rsquo;)</p>
          <p className="text-(--color-success)">+ it(&lsquo;handles partial refunds&rsquo;)</p>
          <p className="text-(--color-success)">+ it(&lsquo;rejects expired cards&rsquo;)</p>
          <p className="text-(--color-success)">+ it(&lsquo;retries on gateway timeout&rsquo;)</p>
        </div>
        <div className="border-t border-(--color-border) px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--color-fg-subtle)">Coverage</span>
            <span className="font-mono text-(--color-fg)">72% → 89%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full rounded-full bg-(--color-success)" style={{ width: '89%' }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="package" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
          <span className="text-sm font-semibold text-(--color-fg)">#511 weekly upgrades</span>
        </div>
        <StatusBadge label="opened PR" />
      </div>
      <div className="space-y-2.5 p-4 font-mono text-xs">
        {[
          { name: 'next', bump: '15.4.0 → 16.0.0', flag: false },
          { name: 'lodash', bump: '4.17.20 → 4.17.21', flag: false },
          { name: 'zod', bump: '3.22.4 → 3.23.8', flag: false },
          { name: 'react', bump: '18.3 → 19.0', flag: true },
        ].map((d) => (
          <div key={d.name} className="flex items-center gap-2.5">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                d.flag ? 'bg-(--color-warn)/15 text-(--color-warn)' : 'bg-(--color-success)/15 text-(--color-success)'
              }`}
            >
              {d.flag ? '!' : <Icon name="check" className="h-2.5 w-2.5" />}
            </span>
            <span className="text-(--color-fg)">{d.name}</span>
            <span className="ml-auto text-(--color-fg-subtle)">{d.bump}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-(--color-border) px-4 py-3 text-xs text-(--color-fg-subtle)">
        3 safe bumps grouped · 1 major flagged for you
      </div>
    </div>
  );
}

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

      {/* Use Cases */}
      <UseCasesScroller items={useCases} visuals={useCases.map((_, i) => <MockVisual key={i} index={i} />)} />

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
