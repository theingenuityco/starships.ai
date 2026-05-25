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
  description:
    'An autonomous engineering room that turns your backlog into reviewed pull requests, with every change tested against a real checkout before you ever look.',
};

export const dynamic = 'force-static';

const engineeringFeed = [
  { agent: 'Triage', action: 'pulled 4 new issues, queued 2 as small and testable', state: 'done' as const },
  { agent: 'Triage', action: 'deduped #318 against #290', state: 'done' as const },
  { agent: 'Scoper', action: 'wrote a spec for "fix null deref in billing"', state: 'done' as const },
  { agent: 'Scoper', action: 'reading the payments module for edge cases', state: 'working' as const },
  { agent: 'Builder', action: 'cloned the repo on branch fix/billing-null', state: 'working' as const },
  { agent: 'Builder', action: 'ran your test suite: 142 passing', state: 'done' as const },
  { agent: 'Builder', action: 'opened PR #441, checks green', state: 'done' as const },
  { agent: 'Reviewer', action: 'reviewed #441 against your conventions', state: 'done' as const },
  { agent: 'Reviewer', action: 'flagged a missing test on #438', state: 'needs-you' as const },
];

const engineeringRooms = [
  { name: 'Lobby' },
  { name: 'Engineering', unread: 3 },
  { name: 'Sales' },
  { name: 'Operations' },
];

const useCases = [
  {
    situation: 'A bug sits in the backlog',
    headline: 'Triaged and scoped overnight.',
    description:
      'Triage pulls new issues, dedupes them, and picks the ones small and testable enough to act on. Scoper reads the relevant code and writes a clear spec. You wake up to a groomed backlog, not a pile.',
  },
  {
    situation: 'A fix needs writing',
    headline: 'Written, then run against your tests.',
    description:
      'Builder clones the repo into an isolated workspace, makes the change, and runs your real test suite on a real checkout. Nothing moves forward until the suite is green.',
  },
  {
    situation: 'A pull request is ready',
    headline: 'Green before you open it.',
    description:
      'Builder opens the PR with the change and passing checks. Reviewer reads the diff against your own conventions and leaves comments. You review work that already builds and passes, then merge.',
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
    name: 'Triage',
    trigger: 'Runs on a schedule',
    icon: 'list',
    responsibilities: [
      'Pulls and dedupes incoming issues',
      'Decides what is small and test-verifiable',
      'Places work on the pipeline board',
    ],
  },
  {
    name: 'Scoper',
    trigger: 'When triage queues a ticket',
    icon: 'file-text',
    responsibilities: [
      'Reads the relevant code',
      'Writes a spec with acceptance criteria',
      'Saves it as a doc on the ticket',
    ],
  },
  {
    name: 'Builder',
    trigger: 'When a spec is approved',
    icon: 'git-branch',
    responsibilities: [
      'Clones the repo into an isolated workspace',
      'Makes the change and runs your tests',
      'Opens a pull request with green checks',
    ],
  },
  {
    name: 'Reviewer',
    trigger: 'When the Builder opens a PR',
    icon: 'eye',
    responsibilities: [
      'Reads the diff against your conventions',
      'Leaves review comments',
      'Routes the card for your approval',
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

// Mock artifact for each stage of the loop: the pipeline board, the test run, and
// the already-green PR. Shows the outcome, not a feature grid.
function MockVisual({ index }: { index: number }) {
  if (index === 0) {
    const columns: { title: string; cards: string[] }[] = [
      { title: 'Backlog', cards: ['Null deref in billing', 'Flaky payments test', 'Stale dep: zod'] },
      { title: 'Scoped', cards: ['Retry on gateway timeout', 'Add refund edge cases'] },
      { title: 'Building', cards: ['fix/billing-null'] },
      { title: 'In review', cards: ['#441 tests green'] },
    ];
    return (
      <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
        <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="list" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="text-sm font-semibold text-(--color-fg)">Engineering pipeline</span>
          </div>
          <StatusBadge label="7 in flight" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-brand text-[11px] uppercase tracking-widest text-(--color-fg-subtle)">{col.title}</span>
                <span className="font-mono text-[11px] text-(--color-fg-subtle)">{col.cards.length}</span>
              </div>
              {col.cards.map((c) => (
                <div
                  key={c}
                  className="rounded-md border border-(--color-border) bg-(--color-bg) px-2.5 py-2 text-xs leading-snug text-(--color-fg-muted)"
                >
                  {c}
                </div>
              ))}
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
            <Icon name="git-branch" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="font-mono text-sm font-semibold text-(--color-fg)">fix/billing-null</span>
          </div>
          <StatusBadge label="tests green" />
        </div>
        <div className="space-y-1 p-4 font-mono text-xs">
          <p className="text-(--color-fg-muted)">$ pnpm test</p>
          <p className="text-(--color-success)">PASS billing.test.ts</p>
          <p className="text-(--color-success)">PASS payments.test.ts</p>
          <p className="text-(--color-fg-subtle)">Tests: 142 passed, 142 total</p>
        </div>
        <div className="border-t border-(--color-border) px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--color-fg-subtle)">Run on a real checkout</span>
            <span className="font-mono text-(--color-fg)">142 / 142</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full rounded-full bg-(--color-success)" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="git-branch" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
          <span className="text-sm font-semibold text-(--color-fg)">#441 fix null deref in billing</span>
        </div>
        <StatusBadge label="ready to merge" />
      </div>
      <div className="flex items-center gap-3 border-b border-(--color-border) px-4 py-2.5 font-mono text-xs">
        <span className="text-(--color-success)">+38</span>
        <span className="text-(--color-warn)">−4</span>
        <span className="text-(--color-fg-subtle)">2 files</span>
      </div>
      <div className="space-y-2.5 p-4 text-sm">
        {[
          { text: 'Tests passed (142)' },
          { text: 'Build passed' },
          { text: 'Reviewed against your conventions' },
        ].map((c) => (
          <div key={c.text} className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-(--color-success)/15 text-(--color-success)">
              <Icon name="check" className="h-2.5 w-2.5" />
            </span>
            <span className="text-(--color-fg-muted)">{c.text}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-(--color-border) px-4 py-3 text-xs text-(--color-fg-subtle)">
        You review a PR that already builds and passes. You merge.
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
        Each one owns a stage of the pipeline.
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
            Add a stage to the pipeline
            <br />
            for the way your team ships.
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
              Your backlog
            </FadeIn>
            <FadeIn as="span" delay={160} className="block">
              ships itself.
            </FadeIn>
            <FadeIn as="span" delay={240} className="block text-(--color-fg-muted)">
              Every PR already green.
            </FadeIn>
          </h1>
          <FadeIn delay={320}>
            <p className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
              The Engineering room runs a crew of agents that triage your issues, scope the work, write the change, and run
              your own tests on a real checkout before opening a pull request. You review work that already builds and passes,
              then merge. It runs on a schedule, so your engineers can focus on the product.
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

      {/* The loop */}
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
              not babysitting the backlog.
            </FadeIn>
          </h2>
          <FadeIn as="p" delay={270} className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Tell us how your team ships. We&rsquo;ll configure the Engineering room around your repo and your conventions, and
            hand you the keys.
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
