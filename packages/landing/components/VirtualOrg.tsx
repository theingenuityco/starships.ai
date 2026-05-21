'use client';

import { FadeIn } from './FadeIn';

type Agent = {
  name: string;
  room: 'Engineering' | 'Sales' | 'Ops' | 'Marketing';
  tools: string;
  status: string;
  state: 'working' | 'idle' | 'needs-you';
  span?: 'wide' | 'normal';
};

const agents: Agent[] = [
  { name: 'PR Reviewer', room: 'Engineering', tools: 'GitHub', status: 'reviewing PR #432', state: 'working' },
  { name: 'Test Author', room: 'Engineering', tools: 'GitHub · Vitest', status: 'writing tests for billing.ts', state: 'working', span: 'wide' },
  { name: 'Security Scanner', room: 'Engineering', tools: 'GitHub · Snyk', status: 'scanning latest diff', state: 'working' },
  { name: 'Docs Writer', room: 'Engineering', tools: 'GitHub · Docs', status: 'updated /api/auth · v2', state: 'idle' },
  { name: 'Dependency Upgrader', room: 'Engineering', tools: 'GitHub · npm', status: 'idle · last run 2h ago', state: 'idle' },

  { name: 'Account Researcher', room: 'Sales', tools: 'LinkedIn · Apollo', status: 'enriched 38 leads', state: 'working' },
  { name: 'Outreach Drafter', room: 'Sales', tools: 'Gmail · HubSpot', status: '12 emails awaiting you', state: 'needs-you', span: 'wide' },
  { name: 'Follow-up Coordinator', room: 'Sales', tools: 'Gmail · Calendar', status: 'queued 4 follow-ups', state: 'idle' },
  { name: 'CRM Updater', room: 'Sales', tools: 'HubSpot', status: 'synced 12 contacts', state: 'idle' },

  { name: 'Ticket Triager', room: 'Ops', tools: 'Zendesk', status: 'triaged 47 tickets', state: 'working' },
  { name: 'Status Reporter', room: 'Ops', tools: 'Slack · Datadog', status: 'posting daily report', state: 'working' },
  { name: 'KB Writer', room: 'Ops', tools: 'Notion · Docs', status: 'drafted 3 articles', state: 'idle' },
  { name: 'Anomaly Watcher', room: 'Ops', tools: 'Datadog · Sentry', status: 'flagged latency spike', state: 'needs-you', span: 'wide' },

  { name: 'Content Writer', room: 'Marketing', tools: 'Notion · WordPress', status: 'drafted launch post', state: 'working' },
  { name: 'Campaign Planner', room: 'Marketing', tools: 'Mailchimp · GA4', status: 'planning Q3 sequence', state: 'idle' },
  { name: 'SEO Analyst', room: 'Marketing', tools: 'GSC · Ahrefs', status: 'audited 12 pages', state: 'idle' },
];

function AgentCard({ a }: { a: Agent }) {
  return (
    <div
      className={`rounded-(--radius-card) border bg-(--color-bg-elev) px-4 py-3 transition-colors duration-700 ${
        a.span === 'wide' ? 'sm:col-span-2' : ''
      } ${
        a.state === 'needs-you'
          ? 'border-(--color-accent)/30'
          : a.state === 'working'
            ? 'border-(--color-warn)/30'
            : 'border-(--color-border)'
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
        <span className="font-mono">{a.room}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              a.state === 'working'
                ? 'animate-pulse bg-(--color-warn)'
                : a.state === 'needs-you'
                  ? 'bg-(--color-accent)'
                  : 'bg-(--color-fg-subtle)'
            }`}
          />
          {a.state === 'needs-you' ? 'needs you' : a.state === 'working' ? 'working' : 'idle'}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-(--color-fg)">{a.name}</p>
      <p className="mt-1 text-xs font-mono text-(--color-fg-subtle)">{a.tools}</p>
      <p className="mt-3 line-clamp-1 text-sm text-(--color-fg-muted)">{a.status}</p>
    </div>
  );
}

export function VirtualOrg() {
  return (
    <section className="border-b border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-12 sm:pt-24">
        <FadeIn>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            <span className="text-(--color-fg-muted)">Not a chatbot.</span>
            <br />
            <span className="text-(--color-fg-muted)">Not an assistant.</span>
            <br />
            <span className="text-(--color-fg-muted)">Not a copilot.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={300} className="mt-56 sm:mt-64">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            A virtual org operated by agents.
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-(--color-fg-muted) leading-relaxed">
            Specialist agents, grouped into rooms, connected to your real tools. Each one with a role, a beat, and a name.
          </p>
        </FadeIn>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-28">
        <FadeIn delay={150}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 [grid-auto-flow:dense]">
            {agents.map((a, i) => (
              <AgentCard key={`${a.name}-${i}`} a={a} />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between text-xs text-(--color-fg-subtle)">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" /> idle
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-warn)" /> working
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" /> needs you
              </span>
            </div>
            <span className="font-mono">16 of 47 agents shown</span>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
