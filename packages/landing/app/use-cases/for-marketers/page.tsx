import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';

export const metadata: Metadata = {
  title: 'Marketing — Starships',
  description: 'Autonomous agents for outreach, content, campaign planning, and customer knowledge.',
};

export const dynamic = 'force-static';

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

const agents = [
  {
    name: 'Outreach Drafter',
    trigger: 'On every new qualified lead',
    description:
      'Reads the lead\'s company, role, and recent signals. Drafts a personalised first-touch email that matches your brand voice guide. Queues it for your approval before anything goes out.',
  },
  {
    name: 'Campaign Planner',
    trigger: 'At the start of each quarter',
    description:
      'Reviews your previous campaign data, reads your brand positioning docs, and drafts a full campaign calendar — themes, channel breakdown, send schedule. You review and approve the plan, then it executes.',
  },
  {
    name: 'KB Writer',
    trigger: 'On every resolved support ticket',
    description:
      'Reads the ticket thread, identifies whether the resolution is worth documenting, and drafts a knowledge base article in your tone of voice. Publishes when you approve.',
  },
  {
    name: 'Status Reporter',
    trigger: 'Every morning at 8am',
    description:
      'Pulls metrics from your connected data sources, summarises what moved and what didn\'t, and posts the daily brief to your team. Everyone starts the day informed, without you writing a word.',
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

      {/* Use Cases */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            <FadeIn as="span" className="block" delay={0}>
              What the room
            </FadeIn>
            <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
              handles for you.
            </FadeIn>
          </h2>
          <div className="mt-20 space-y-20 sm:space-y-24">
            {useCases.map((uc, i) => (
              <div key={uc.situation} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <FadeIn>
                    <p className="text-3xl font-semibold tracking-tight leading-[1.05] text-(--color-fg-muted) sm:text-4xl">{uc.situation}.</p>
                  </FadeIn>
                  <FadeIn delay={90}>
                    <p className="mt-6 text-xl font-semibold tracking-tight">{uc.headline}</p>
                    <p className="mt-3 max-w-md text-(--color-fg-muted) leading-relaxed">{uc.description}</p>
                  </FadeIn>
                </div>
                <FadeIn delay={180} className={i % 2 === 1 ? 'lg:order-1' : ''}>
                  <MockVisual index={i} />
                </FadeIn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <FadeIn>
            <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Your marketing crew</p>
          </FadeIn>
          <FadeIn delay={60}>
            <h2 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">Always on. Always writing.</h2>
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
