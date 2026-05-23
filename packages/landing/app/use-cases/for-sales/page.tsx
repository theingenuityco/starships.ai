import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';

export const metadata: Metadata = {
  title: 'Sales — Starships',
  description: 'Autonomous agents for account research, CRM hygiene, follow-up coordination, and ticket triage.',
};

export const dynamic = 'force-static';

const agents = [
  {
    name: 'Account Researcher',
    trigger: 'On every new lead',
    description:
      'The moment a new contact hits your CRM, it researches the company — funding stage, headcount, recent news, tech stack, decision-maker org. Enriches the record and routes it to the right rep before they even pick up the phone.',
  },
  {
    name: 'CRM Updater',
    trigger: 'After every logged interaction',
    description:
      'Reads email threads, call transcripts, and meeting notes. Updates contact records, deal stages, and activity logs automatically. Your CRM stays clean without anyone spending Friday afternoon on data entry.',
  },
  {
    name: 'Follow-up Coordinator',
    trigger: 'On every deal stage change',
    description:
      'Tracks where every deal is and what the agreed next step was. When a follow-up is due, drafts the email, queues it for your approval, and logs the touchpoint after send. Nothing slips through the cracks.',
  },
  {
    name: 'Ticket Triager',
    trigger: 'On every new inbound request',
    description:
      'Reads incoming messages across email, Slack, and your support inbox. Routes them to the right person, auto-responds to common questions, and escalates anything that needs a human immediately.',
  },
];

const primitives = [
  {
    name: 'Goals.',
    body: 'Set a goal for the Sales room — "close $200k ARR this quarter." Agents break it into tasks: research the 12 accounts in the pipeline, follow up with Broke Inc, update the 5 stale records. You see what\'s moving. They do the work.',
    visual: (
      <div className="w-full overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
        <div className="border-b border-(--color-border) bg-(--color-bg-soft) px-3.5 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <Icon name="layout" className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
            <span className="flex-1 truncate text-xs font-semibold text-(--color-fg)">Sales room</span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--color-fg-subtle)">3/6</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-(--color-fg-muted)">Close $200k ARR this quarter.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
            <div className="h-full rounded-full bg-(--color-success)" style={{ width: '50%' }} />
          </div>
        </div>
        <div className="space-y-px p-2">
          {[
            { title: 'Research 12 pipeline accounts', done: true },
            { title: 'Follow up with Broke Inc', done: false, col: 'In progress' },
            { title: 'Update 5 stale CRM records', done: true },
            { title: 'Draft proposal for ABC Enterprise', done: false, col: 'In review' },
            { title: 'Send intro to new inbound lead', done: true },
            { title: 'Schedule Q3 pipeline review', done: false, col: 'Todo' },
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
    body: 'Account Researcher fires on every new CRM lead. CRM Updater fires after every logged interaction. Follow-up Coordinator fires when a follow-up is overdue. Real-time, event-driven — not a batch job you run on Fridays.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { who: 'Account Researcher', when: 'on every new CRM lead', next: 'on event', sub: 'live' },
          { who: 'CRM Updater', when: 'after every logged interaction', next: 'on event', sub: 'live' },
          { who: 'Follow-up Coordinator', when: 'when follow-up is overdue', next: 'on alert', sub: 'armed' },
          { who: 'Ticket Triager', when: 'on every new inbound request', next: 'on event', sub: 'live' },
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
    body: 'Upload your sales playbook, your ICP definition, your qualification framework, your objection handling guide. Account Researcher reads the ICP before deciding who to prioritise. Follow-up Coordinator reads the playbook before drafting the email.',
    visual: (
      <div className="w-full space-y-2">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <p className="text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Read by every agent</p>
          <p className="font-mono text-[10px] text-(--color-fg-subtle)">4 docs · synced</p>
        </div>
        {['Sales playbook', 'ICP definition', 'Qualification framework', 'Objection handling guide'].map((d) => (
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
    body: 'Connect your CRM, email provider, and call recording tool. CRM Updater reads your deal data. Account Researcher queries the contact record before enriching. All reads — agents ask before writing anything to your live database.',
    visual: (
      <div className="w-full space-y-2">
        {[
          { name: 'HubSpot', desc: 'Contacts, deals, pipeline stages', slug: 'hubspot' },
          { name: 'Gmail', desc: 'Email threads and interactions', slug: 'gmail' },
          { name: 'Stripe', desc: 'Revenue, deals, payment history', slug: 'stripe' },
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

export default function ForSalesPage() {
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
              <span>Sales Room</span>
            </p>
          </FadeIn>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            <FadeIn as="span" delay={80} className="block">
              No lead goes cold.
            </FadeIn>
            <FadeIn as="span" delay={160} className="block">
              No CRM goes stale.
            </FadeIn>
            <FadeIn as="span" delay={240} className="block text-(--color-fg-muted)">
              No follow-up gets forgotten.
            </FadeIn>
          </h1>
          <FadeIn delay={320}>
            <p className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
              Account research done before your first call. CRM updated after every interaction. Follow-ups queued and ready.
              The Sales room keeps your pipeline moving — even when you&rsquo;re heads-down closing.
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
            <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Your sales crew</p>
          </FadeIn>
          <FadeIn delay={60}>
            <h2 className="text-3xl font-semibold tracking-tight leading-[1.05] sm:text-4xl">
              Always working the pipeline.
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
            <p className="mt-4 text-lg text-(--color-fg-muted)">Every agent in the Sales room is built on four primitives you control.</p>
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
              Your pipeline deserves
            </FadeIn>
            <FadeIn as="span" delay={90} className="block text-6xl sm:text-7xl md:text-8xl">
              a team that
            </FadeIn>
            <FadeIn as="span" delay={180} className="block text-6xl sm:text-7xl md:text-8xl">
              never sleeps.
            </FadeIn>
          </h2>
          <FadeIn as="p" delay={270} className="mt-8 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Tell us about your sales motion. We&rsquo;ll configure the Sales room and get agents working on your pipeline this week.
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
