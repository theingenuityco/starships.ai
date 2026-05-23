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

const primitives = [
  {
    name: 'Goals.',
    body: 'Set a goal for the Marketing room — "grow inbound 20% this quarter." Agents break it into tasks: plan the Q2 content calendar, draft the nurture sequence, publish 4 articles by Friday. You see the board. They execute.',
    visual: (
      <div className="w-full overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
        <div className="border-b border-(--color-border) bg-(--color-bg-soft) px-3.5 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <Icon name="layout" className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
            <span className="flex-1 truncate text-xs font-semibold text-(--color-fg)">Marketing room</span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--color-fg-subtle)">2/5</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-(--color-fg-muted)">Grow inbound 20% this quarter.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full rounded-full bg-(--color-success)" style={{ width: '40%' }} />
          </div>
        </div>
        <div className="space-y-px p-2">
          {[
            { title: 'Plan Q2 content calendar', done: true },
            { title: 'Draft nurture sequence (5 emails)', done: false, col: 'In progress' },
            { title: 'Publish 4 blog articles by Friday', done: false, col: 'In progress' },
            { title: 'Update homepage messaging', done: true },
            { title: 'Schedule social for launch week', done: false, col: 'Todo' },
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
              {'col' in t && !t.done ? (
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
    body: 'Outreach Drafter fires when a new lead enters your CRM. Status Reporter fires every morning at 8am. Campaign Planner fires on the first Monday of each quarter. Not when you remember to ask — on schedule, automatically.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { who: 'Outreach Drafter', when: 'on every new CRM lead', next: 'on event', sub: 'live' },
          { who: 'Status Reporter', when: 'every morning at 8:00am', next: '8:00 AM', sub: 'tomorrow' },
          { who: 'Campaign Planner', when: 'first Monday of each quarter', next: 'Jul 7', sub: 'scheduled' },
          { who: 'KB Writer', when: 'on every resolved ticket', next: 'on event', sub: 'live' },
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
    body: 'Upload your brand voice guide, your persona descriptions, your messaging hierarchy. Every agent reads them before writing a single word. Your outreach sounds like you wrote it — because the agent knew what you sound like.',
    visual: (
      <div className="w-full space-y-2">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
          <p className="font-mono text-[10px] text-(--color-fg-subtle)">5 docs · synced</p>
        </div>
        {['Brand voice guide', 'Persona library', 'Messaging framework', 'Tone of voice', 'Competitor positioning'].map((d) => (
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
    body: 'Connect your CRM, email platform, and product analytics. Campaign Planner reads what campaigns actually converted. Status Reporter reads your current MRR and active users. Real data, in every brief.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { name: 'HubSpot', desc: 'Leads, contacts, deal stages', slug: 'hubspot' },
          { name: 'Mailchimp', desc: 'Campaigns and open rates', slug: 'mailchimp' },
          { name: 'Product analytics', desc: 'MRR, active users, funnel', slug: 'analytics' },
        ].map((d) => (
          <div
            key={d.slug}
            className="flex items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-4 py-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-bg-soft) ring-1 ring-(--color-border)">
              <Icon name="database" className="h-4 w-4 text-(--color-fg-muted)" />
            </span>
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

export default function ForMarketersPage() {
  return (
    <main className="pt-24">
      {/* Hero */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <FadeIn delay={0}>
            <Link href="/use-cases" className="text-xs text-(--color-fg-subtle) hover:text-(--color-fg) transition-colors">
              ← All use cases
            </Link>
          </FadeIn>
          <FadeIn delay={40}>
            <p className="mt-6 text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase">Marketing room</p>
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

      {/* Primitives */}
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <FadeIn>
            <h2 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">The primitives behind it.</h2>
          </FadeIn>
          <FadeIn delay={60}>
            <p className="mt-4 text-lg text-(--color-fg-muted)">Every agent in the Marketing room is built on four primitives you control.</p>
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
