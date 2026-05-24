import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { TrustControl } from '@/components/TrustControl';
import { UseCasesScroller } from '@/components/UseCasesScroller';

export const metadata: Metadata = {
  title: 'Sales — Starships',
  description: 'Autonomous agents for account research, CRM hygiene, follow-up coordination, and ticket triage.',
};

export const dynamic = 'force-static';

const useCases = [
  {
    situation: 'A new lead hits your CRM',
    headline: 'Fully researched before the first call.',
    description:
      'Account Researcher looks up funding stage, headcount, recent news, and tech stack. Enriches the record and routes it to the right rep before they pick up the phone.',
  },
  {
    situation: 'A call ends',
    headline: 'CRM updated without anyone typing.',
    description:
      'CRM Updater reads the transcript and meeting notes, updates the contact record, deal stage, and activity log. Your pipeline stays accurate without anyone spending Friday on data entry.',
  },
  {
    situation: 'A follow-up is overdue',
    headline: 'Email drafted, queued, and ready.',
    description:
      'Follow-up Coordinator checks what the agreed next step was, drafts the message in your voice, and queues it for your approval. Nothing slips through the cracks.',
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
    name: 'Account Researcher',
    trigger: 'On every new lead',    icon: 'search',
    responsibilities: [
      'Looks up funding, headcount, news, tech stack',
      'Enriches the CRM record',
      'Routes the lead to the right rep',
    ],
  },
  {
    name: 'CRM Updater',
    trigger: 'After every logged interaction',    icon: 'database',
    responsibilities: [
      'Reads threads, call transcripts, meeting notes',
      'Updates contacts, deal stages, activity logs',
      'No more Friday-afternoon data entry',
    ],
  },
  {
    name: 'Follow-up Coordinator',
    trigger: 'On every deal stage change',    icon: 'mail',
    responsibilities: [
      'Tracks the agreed next step on every deal',
      'Drafts the follow-up in your voice',
      'Queues for approval, logs after send',
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
          <span className="text-sm font-semibold text-(--color-fg)">Acme Corp</span>
          <StatusBadge label="enriched" />
        </div>
        <dl className="divide-y divide-(--color-border)">
          {[
            ['Stage', 'Series B'],
            ['Team', '120 people · SF'],
            ['Stack', 'AWS · Segment · Snowflake'],
            ['Signal', 'Raised $40M last month'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-(--color-fg-subtle)">{k}</dt>
              <dd className="text-right font-medium text-(--color-fg)">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2 border-t border-(--color-border) px-4 py-3 text-sm">
          <Icon name="arrow-right" className="h-4 w-4 text-(--color-fg-subtle)" />
          <span className="text-(--color-fg-muted)">
            Routed to <span className="font-medium text-(--color-fg)">Dana (AE)</span>
          </span>
        </div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="w-full overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev)">
        <div className="flex items-center gap-2 border-b border-(--color-border) bg-(--color-bg-soft) px-4 py-3">
          <Icon name="database" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
          <span className="text-sm font-semibold text-(--color-fg)">Beta Inc · updated from call</span>
        </div>
        <div className="space-y-2.5 p-4 text-sm">
          {[
            ['Deal stage', 'Qualification → Discovery'],
            ['Next step', 'Send pricing by Thu'],
            ['Contact', 'Priya Rao · VP Eng'],
            ['Activity', 'Call notes logged'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-(--color-success)">
                <Icon name="check" className="h-2.5 w-2.5 text-(--color-bg)" />
              </span>
              <span className="text-(--color-fg-subtle)">{k}</span>
              <span className="ml-auto font-medium text-(--color-fg)">{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
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
          <span className="text-(--color-fg)">priya@beta.inc</span>
        </div>
        <div className="flex gap-3">
          <span className="w-8 shrink-0 text-(--color-fg-subtle)">Re</span>
          <span className="text-(--color-fg)">Next steps after our call</span>
        </div>
        <p className="border-t border-(--color-border) pt-3 leading-relaxed text-(--color-fg-muted)">
          Hi Priya, great speaking today. As promised, I&rsquo;ve put together pricing for the team tier and a short rollout plan&hellip;
        </p>
      </div>
      <div className="flex gap-2 border-t border-(--color-border) px-4 py-3">
        <span className="rounded-(--radius-button) bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-(--color-bg)">Approve &amp; send</span>
        <span className="rounded-(--radius-button) border border-(--color-border-strong) px-3 py-1.5 text-xs font-medium text-(--color-fg)">Edit</span>
      </div>
    </div>
  );
}

function AgentsHeading() {
  return (
    <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
      <FadeIn as="span" className="block" delay={0}>
        Meet your sales crew.
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
