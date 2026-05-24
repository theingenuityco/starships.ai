import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';
import { RoomDashboard } from '@/components/RoomDashboard';
import { UseCasesScroller } from '@/components/UseCasesScroller';

export const metadata: Metadata = {
  title: 'Engineering — Starships',
  description: 'Autonomous agents for code review, test authoring, security scanning, and dependency management.',
};

export const dynamic = 'force-static';

const engineeringFeed = [
  { agent: 'PR Reviewer', action: 'left 3 comments on #432 auth refactor', state: 'done' as const },
  { agent: 'PR Reviewer', action: 'reviewing #441 payments cleanup', state: 'working' as const },
  { agent: 'PR Reviewer', action: 'flagged unsafe null check on #438', state: 'needs-you' as const },
  { agent: 'Test Author', action: 'committed billing.test.ts', state: 'done' as const },
  { agent: 'Test Author', action: 'generating edge cases for payments module', state: 'working' as const },
  { agent: 'Test Author', action: 'opened PR #444 with auth tests', state: 'done' as const },
  { agent: 'Dependency Upgrader', action: 'bumped 3 packages safely', state: 'done' as const },
  { agent: 'Dependency Upgrader', action: 'flagged react 19 major upgrade', state: 'needs-you' as const },
  { agent: 'Security Scanner', action: 'scan complete, no issues found', state: 'done' as const },
];

const engineeringRooms = [
  { name: 'Lobby' },
  { name: 'Engineering', unread: 3 },
  { name: 'Sales' },
  { name: 'Operations' },
];

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

type Agent = {
  name: string;
  trigger: string;
  icon: string;
  responsibilities: string[];
};

const agents: Agent[] = [
  {
    name: 'PR Reviewer',
    trigger: 'On every pull request',    icon: 'git-branch',
    responsibilities: [
      'Reads the diff against your coding standards',
      'Leaves structured review comments',
      'Flags anything that looks wrong',
    ],
  },
  {
    name: 'Test Author',
    trigger: 'On every new feature commit',    icon: 'file-text',
    responsibilities: [
      'Reads the changed files',
      'Generates happy-path and edge-case tests',
      'Opens a PR with the new test file',
    ],
  },
  {
    name: 'Dependency Upgrader',
    trigger: 'Weekly, every Monday',    icon: 'package',
    responsibilities: [
      'Reads changelogs for outdated packages',
      'Groups safe patch + minor bumps into one PR',
      'Flags major-version changes for you',
    ],
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

function AgentsHeading() {
  return (
    <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
      <FadeIn as="span" className="block" delay={0}>
        Meet your engineering crew.
      </FadeIn>
      <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
        Each agent owns a beat.
      </FadeIn>
    </h2>
  );
}

// Indexed editorial cards: big ordinal numeral + agent icon, then a special
// "create your own agent" card in the final slot.
function AgentsCards() {
  return (
    <div className="mt-16 sm:mt-20 grid grid-cols-1 gap-5 sm:grid-cols-2">
      {agents.map((a, i) => (
        <FadeIn key={a.name} delay={i * 80}>
          <div className="relative h-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6">
            <Icon
              name={a.icon}
              className="pointer-events-none absolute -right-16 -top-16 z-0 h-72 w-72 text-(--color-border)"
            />
            <div className="relative z-10">
              <span className="font-mono text-3xl font-semibold tabular-nums text-(--color-border-strong)">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-(--color-fg)">{a.name}</h3>
              <p className="mt-1.5 font-brand text-xs uppercase tracking-widest text-(--color-fg-subtle)">{a.trigger}</p>
              <ul className="mt-4 space-y-2 border-t border-(--color-border) pt-4 text-[15px] leading-relaxed text-(--color-fg-muted)">
                {a.responsibilities.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <Icon name="check" className="mt-1 h-3.5 w-3.5 shrink-0 text-(--color-success)" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeIn>
      ))}

      {/* Special slot — invite the user to commission a new agent. */}
      <FadeIn delay={agents.length * 80}>
        <Link
          href="/request-demo?room=engineering"
          className="group flex h-full flex-col items-center justify-center rounded-(--radius-card) border border-dashed border-(--color-border-strong) bg-(--color-bg) p-6 text-center transition-colors hover:border-(--color-accent) hover:bg-(--color-bg-elev)"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-(--color-accent-soft) text-(--color-fg) transition-colors group-hover:bg-(--color-accent) group-hover:text-(--color-bg)">
            <Icon name="plus" className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-(--color-fg)">Create your own agent</h3>
          <p className="mt-2 max-w-xs text-[15px] text-(--color-fg-muted)">
            Build your own for the workflows
            <br />
            unique to your team.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-accent)">
            Get started
            <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </FadeIn>
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
                href="/request-demo?room=engineering"
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

      {/* Room dashboard mockup */}
      <RoomDashboard
        title="starships · engineering"
        activeRoom="Engineering"
        rooms={engineeringRooms}
        feedPool={engineeringFeed}
        wallpaper="linear-gradient(180deg, rgba(7,8,11,0.45) 0%, rgba(7,8,11,0.75) 100%), url(/wallpaper-engineering.jpg)"
      />

      {/* Use Cases */}
      <UseCasesScroller items={useCases} visuals={useCases.map((_, i) => <MockVisual key={i} index={i} />)} />

      {/* Agents */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
          <AgentsHeading />
          <AgentsCards />
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
                href="/request-demo?room=engineering"
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
