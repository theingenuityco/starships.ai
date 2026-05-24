import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';
import { RoomDashboard } from '@/components/RoomDashboard';
import { UseCasesScroller } from '@/components/UseCasesScroller';

export const metadata: Metadata = {
  title: 'Marketing — Starships',
  description: 'Autonomous agents for outreach, content, campaign planning, and customer knowledge.',
};

export const dynamic = 'force-static';

const marketingFeed = [
  { agent: 'Outreach Drafter', action: 'queued email to Jordan @ Acme', state: 'needs-you' as const },
  { agent: 'Outreach Drafter', action: 'researching Blake @ Notion', state: 'working' as const },
  { agent: 'Outreach Drafter', action: 'email to Sam @ Figma approved and sent', state: 'done' as const },
  { agent: 'Campaign Planner', action: 'drafted Q3 campaign calendar', state: 'done' as const },
  { agent: 'Campaign Planner', action: 'reading last quarter performance metrics', state: 'working' as const },
  { agent: 'Campaign Planner', action: 'Q4 webinar plan ready for review', state: 'needs-you' as const },
  { agent: 'KB Writer', action: 'published "How to reset your API key"', state: 'done' as const },
  { agent: 'KB Writer', action: 'drafting article from ticket #3014', state: 'working' as const },
  { agent: 'KB Writer', action: 'article #15 ready for approval', state: 'needs-you' as const },
];

const marketingRooms = [
  { name: 'Lobby' },
  { name: 'Marketing', unread: 2 },
  { name: 'Sales' },
  { name: 'Engineering' },
];

const useCases = [
  {
    situation: 'A new lead enters your CRM',
    headline: 'First touch drafted and queued.',
    description:
      'Outreach Drafter researches the company, reads your brand voice guide, and drafts a personalized first-touch email. It waits in the queue until you approve it. Nothing goes out without your sign-off.',
  },
  {
    situation: 'The quarter starts',
    headline: 'Campaign calendar ready by Monday.',
    description:
      'Campaign Planner reviews what worked last quarter, reads your positioning docs, and delivers a full calendar with themes, channels, and send schedule. You review and approve the plan.',
  },
  {
    situation: 'A support ticket gets resolved',
    headline: 'KB article published before the next one.',
    description:
      'KB Writer reads the ticket thread, decides if the resolution is worth documenting, and drafts an article in your tone of voice. Published when you approve it.',
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
    name: 'Outreach Drafter',
    trigger: 'On every new qualified lead',    icon: 'mail',
    responsibilities: [
      'Reads the lead’s company, role, and signals',
      'Drafts a first-touch email in your brand voice',
      'Queues it for your approval',
    ],
  },
  {
    name: 'Campaign Planner',
    trigger: 'At the start of each quarter',    icon: 'calendar',
    responsibilities: [
      'Reviews what worked last quarter',
      'Reads your brand positioning docs',
      'Delivers themes, channels, and a schedule',
    ],
  },
  {
    name: 'KB Writer',
    trigger: 'On every resolved support ticket',    icon: 'file-text',
    responsibilities: [
      'Reads the resolved ticket thread',
      'Decides if it’s worth documenting',
      'Drafts + publishes in your tone of voice',
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
            <Icon name="mail" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="text-sm font-semibold text-(--color-fg)">Draft</span>
          </div>
          <StatusBadge label="queued" tone="warn" />
        </div>
        <div className="space-y-2 p-4 text-sm">
          <div className="flex gap-3">
            <span className="w-8 shrink-0 text-(--color-fg-subtle)">To</span>
            <span className="text-(--color-fg)">jordan@acme.com</span>
          </div>
          <div className="flex gap-3">
            <span className="w-8 shrink-0 text-(--color-fg-subtle)">Re</span>
            <span className="text-(--color-fg)">Saw the Series B — congrats</span>
          </div>
          <p className="border-t border-(--color-border) pt-3 leading-relaxed text-(--color-fg-muted)">
            Hi Jordan, congrats on the raise. Teams scaling as fast as Acme usually hit a wall on&hellip;
          </p>
        </div>
        <div className="flex gap-2 border-t border-(--color-border) px-4 py-3">
          <span className="rounded-(--radius-button) bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-(--color-bg)">Approve &amp; send</span>
          <span className="rounded-(--radius-button) border border-(--color-border-strong) px-3 py-1.5 text-xs font-medium text-(--color-fg)">Edit</span>
        </div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
        <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="calendar" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <span className="text-sm font-semibold text-(--color-fg)">Q2 campaign calendar</span>
          </div>
          <StatusBadge label="ready" />
        </div>
        <div className="divide-y divide-(--color-border)">
          {[
            ['Apr', 'Spring product launch push'],
            ['May', 'Webinar series + nurture'],
            ['Jun', 'Customer stories campaign'],
          ].map(([m, plan]) => (
            <div key={m} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
              <span className="w-8 shrink-0 font-mono text-xs text-(--color-fg-subtle)">{m}</span>
              <span className="text-(--color-fg)">{plan}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-(--color-border) px-4 py-3 text-xs text-(--color-fg-subtle)">
          3 channels · 12 sends planned
        </div>
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="file-text" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
          <span className="text-sm font-semibold text-(--color-fg)">KB article</span>
        </div>
        <StatusBadge label="published" />
      </div>
      <div className="p-4">
        <p className="text-base font-semibold text-(--color-fg)">How to reset your API key</p>
        <p className="mt-2 leading-relaxed text-(--color-fg-muted) text-sm">
          If your key is compromised or rotated on a schedule, you can generate a new one from Settings&hellip;
        </p>
      </div>
      <div className="flex items-center gap-3 border-t border-(--color-border) px-4 py-3 text-xs text-(--color-fg-subtle)">
        <span>From ticket #2841</span>
        <span>·</span>
        <span>tone matched</span>
        <span>·</span>
        <span>4 min read</span>
      </div>
    </div>
  );
}

function AgentsHeading() {
  return (
    <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
      <FadeIn as="span" className="block" delay={0}>
        Meet your marketing crew.
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
          href="/contact"
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

export default function ForMarketersPage() {
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
              <span>Marketing Room</span>
            </p>
          </FadeIn>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            <FadeIn as="span" delay={80} className="block">
              Marketing that runs
            </FadeIn>
            <FadeIn as="span" delay={160} className="block">
              while you sleep.
            </FadeIn>
            <FadeIn as="span" delay={240} className="block text-(--color-fg-muted)">
              Not just AI-assisted.
            </FadeIn>
          </h1>
          <FadeIn delay={320}>
            <p className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
              Outreach sequences written and queued. KB articles published. Campaign cadences planned. Status updates posted.
              The Marketing room never misses a beat — because it doesn&rsquo;t need to be asked.
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

      {/* Room dashboard mockup */}
      <RoomDashboard
        title="starships · marketing"
        activeRoom="Marketing"
        rooms={marketingRooms}
        feedPool={marketingFeed}
        wallpaper="linear-gradient(180deg, rgba(7,8,11,0.45) 0%, rgba(7,8,11,0.75) 100%), url(/wallpaper-marketing.jpg)"
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
              Marketing that scales
            </FadeIn>
            <FadeIn as="span" delay={90} className="block text-6xl sm:text-7xl md:text-8xl">
              without a
            </FadeIn>
            <FadeIn as="span" delay={180} className="block text-6xl sm:text-7xl md:text-8xl">
              bigger team.
            </FadeIn>
          </h2>
          <FadeIn as="p" delay={270} className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Tell us about your brand. We&rsquo;ll configure the Marketing room and have agents working by your next planning cycle.
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
