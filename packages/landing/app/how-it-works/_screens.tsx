import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { FinalCTA } from '@/components/FinalCTA';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

const orgFeed = [
  { agent: 'PR Reviewer', action: 'left 3 comments on #432 auth refactor', state: 'done' as const },
  { agent: 'Account Researcher', action: 'enriched 12 new leads from the webinar', state: 'done' as const },
  { agent: 'Outreach Drafter', action: 'drafting follow-up to Northwind Co', state: 'working' as const },
  { agent: 'Security Scanner', action: 'flagged an exposed key on #441', state: 'needs-you' as const },
  { agent: 'Status Reporter', action: 'posted the morning summary to #ops', state: 'done' as const },
  { agent: 'Test Author', action: 'opened PR #444 with billing tests', state: 'done' as const },
  { agent: 'CRM Updater', action: 'synced 8 deals to HubSpot', state: 'done' as const },
  { agent: 'Campaign Planner', action: 'preparing the Q3 launch calendar', state: 'working' as const },
  { agent: 'Dependency Upgrader', action: 'flagged react 19 major upgrade', state: 'needs-you' as const },
];

const feedTimes = ['09:41:12', '09:40:58', '09:40:31', '09:39:50', '09:39:12', '09:38:44', '09:38:05', '09:37:22', '09:36:48'];

// ---------------------------------------------------------------------------
// Screen panels — each is self-contained (its own border) so it can sit in any
// layout without window chrome.
// ---------------------------------------------------------------------------

function PanelHeader({ icon, title, trailing }: { icon: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3">
      <Icon name={icon} className="h-4 w-4 text-(--color-fg-subtle)" />
      <span className="text-sm font-semibold text-(--color-fg)">{title}</span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </div>
  );
}

export function OnboardingScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <PanelHeader
        icon="plus"
        title="Set up your workspace"
        trailing={<span className="text-xs text-(--color-fg-subtle)">2 / 2</span>}
      />
      <div className="p-5">
        <h3 className="text-lg font-semibold text-(--color-fg)">Tell us about Acme Inc</h3>
        <p className="mt-1.5 text-sm text-(--color-fg-muted)">The more you share, the better your agents.</p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-medium text-(--color-fg-subtle)">Website (optional)</span>
            <div className="mt-1.5 rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 font-mono text-[13px] text-(--color-fg)">
              https://acme.co
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-(--color-fg-subtle)">What does Acme Inc do?</span>
            <div className="mt-1.5 min-h-[88px] rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-sm leading-relaxed text-(--color-fg)">
              Acme Inc builds developer tools for shipping reliable software faster. We help engineering teams automate code review,
              testing, and releases.
            </div>
          </label>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-(--color-fg-subtle)">Back</span>
          <span className="inline-flex items-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-bg)">
            Continue
            <Icon name="arrow-right" className="h-4 w-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

const roomTemplates = [
  { name: 'Engineering', icon: 'git-branch', desc: 'PR review, tests, dependency upgrades', deployed: true },
  { name: 'Sales', icon: 'search', desc: 'Lead research, CRM updates, follow-ups', deployed: false },
  { name: 'Marketing', icon: 'mail', desc: 'Outreach, campaigns, KB articles', deployed: false },
  { name: 'Operations', icon: 'dashboard', desc: 'Status reports, anomaly alerts', deployed: false },
];

export function RoomTemplatesScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <PanelHeader icon="plus" title="Add a room" trailing={<span className="text-xs text-(--color-fg-subtle)">From a template</span>} />
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        {roomTemplates.map((t) => (
          <div key={t.name} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-soft) p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-bg-elev) ring-1 ring-(--color-border)">
                <Icon name={t.icon} className="h-4 w-4 text-(--color-fg-muted)" />
              </span>
              <span className="text-sm font-semibold text-(--color-fg)">{t.name}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-(--color-fg-muted)">{t.desc}</p>
            <div className="mt-4">
              {t.deployed ? (
                <span className="inline-flex items-center gap-1.5 rounded-(--radius-button) border border-(--color-success)/40 bg-(--color-success)/10 px-2.5 py-1 text-xs font-medium text-(--color-success)">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  Deployed
                </span>
              ) : (
                <span className="inline-flex items-center rounded-(--radius-button) border border-(--color-border-strong) px-2.5 py-1 text-xs font-medium text-(--color-fg)">
                  Deploy
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const agentTools = [
  { name: 'github.pulls.createReview', on: true },
  { name: 'github.issues.createComment', on: true },
  { name: 'slack.chat.postMessage', on: true },
  { name: 'github.repos.merge', on: false },
];

export function AgentBuilderScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <PanelHeader
        icon="bot"
        title="New agent"
        trailing={
          <span className="inline-flex items-center rounded-(--radius-button) bg-(--color-accent) px-3 py-1 text-xs font-medium text-(--color-bg)">
            Save
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-accent-soft) text-(--color-fg)">
              <Icon name="git-branch" className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-(--color-fg)">PR Reviewer</div>
              <div className="font-brand text-[10px] uppercase tracking-widest text-(--color-fg-subtle)">On every pull request</div>
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] font-medium text-(--color-fg-subtle)">Instructions</span>
            <div className="mt-1.5 min-h-[88px] rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-[13px] leading-relaxed text-(--color-fg)">
              You review pull requests against our coding standards. Leave structured comments, flag anything unsafe, and never approve
              your own changes.
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-(--color-fg-subtle)">Model</span>
            <div className="mt-1.5 flex items-center justify-between rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-[13px] text-(--color-fg)">
              <span className="font-mono">anthropic/claude-opus</span>
              <Icon name="chevron-down" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
            </div>
          </label>
        </div>
        <div>
          <span className="text-[11px] font-medium text-(--color-fg-subtle)">Tools this agent can use</span>
          <div className="mt-1.5 space-y-2">
            {agentTools.map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between gap-2 rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-3 py-2"
              >
                <span className="truncate font-mono text-[12px] text-(--color-fg-muted)">{t.name}</span>
                <span
                  className={`flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 ${t.on ? 'justify-end bg-(--color-success)/60' : 'justify-start bg-(--color-border-strong)'}`}
                >
                  <span className="h-3 w-3 rounded-full bg-(--color-fg)" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const connectors = [
  { name: 'GitHub', slug: 'github', connected: true },
  { name: 'Linear', slug: 'linear', connected: true },
  { name: 'HubSpot', slug: 'hubspot', connected: false },
  { name: 'Gmail', slug: 'gmail', connected: true },
  { name: 'Notion', slug: 'notion', connected: false },
];

export function ConnectorsScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <PanelHeader icon="plug" title="Connectors" />
      <div className="divide-y divide-(--color-border)">
        {connectors.map((c) => (
          <div key={c.slug} className="flex items-center gap-3 px-5 py-3">
            <img src={`/integrations/${c.slug}.svg`} alt={c.name} className="h-5 w-5 shrink-0 brightness-0 invert opacity-50" />
            <span className="flex-1 text-sm text-(--color-fg)">{c.name}</span>
            {c.connected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(--color-success)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-success)" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-(--radius-button) border border-(--color-border-strong) px-2.5 py-1 text-xs font-medium text-(--color-fg)">
                Connect
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-(--color-border) px-5 py-4">
        <p className="font-brand text-[10px] uppercase tracking-widest text-(--color-fg-subtle)">Pinned context</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { icon: 'file-text', label: 'Coding standards' },
            { icon: 'file-text', label: 'Brand guide' },
            { icon: 'database', label: 'stripe_subscriptions' },
            { icon: 'database', label: 'leads' },
          ].map((p) => (
            <span
              key={p.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2.5 py-1.5 text-xs text-(--color-fg-muted)"
            >
              <Icon name={p.icon} className="h-3.5 w-3.5 shrink-0 text-(--color-fg-subtle)" />
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const triggers = [
  { who: 'Status Reporter', when: 'every morning at 8:00am', next: '8:00 AM', sub: 'tomorrow' },
  { who: 'Security Scanner', when: 'on every push to main', next: 'on push', sub: 'live' },
  { who: 'Anomaly Watcher', when: 'when p95 latency > 500ms', next: 'on alert', sub: 'armed' },
  { who: 'Account Researcher', when: 'on every new lead', next: 'on event', sub: 'live' },
];

export function DirectScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <PanelHeader icon="dashboard" title="Goals & heartbeats" />
      <div className="border-b border-(--color-border) px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon name="hash" className="h-3.5 w-3.5 text-(--color-fg-subtle)" />
          <span className="text-sm font-semibold text-(--color-fg)">Engineering</span>
          <span className="ml-auto font-mono text-[11px] text-(--color-fg-subtle)">68%</span>
        </div>
        <p className="mt-2 text-sm text-(--color-fg)">Keep main green. Ship weekly.</p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-(--color-border)">
          <div className="h-full rounded-full bg-(--color-success)" style={{ width: '68%' }} />
        </div>
      </div>
      <div className="divide-y divide-(--color-border)">
        {triggers.map((b) => (
          <div key={b.who} className="flex items-center justify-between gap-2 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-accent-soft) text-xs font-medium text-(--color-fg)">
                {b.who.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-(--color-fg)">{b.who}</div>
                <div className="truncate text-[11px] text-(--color-fg-subtle)">{b.when}</div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs font-medium text-(--color-fg)">{b.next}</div>
              <div className="text-[11px] text-(--color-fg-subtle)">{b.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateDot({ state }: { state: 'working' | 'done' | 'needs-you' }) {
  if (state === 'done') return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-success)" />;
  if (state === 'working') return <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-(--color-warn)" />;
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />;
}

export function FeedScreen() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
      <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-success)" />
        <span className="text-sm font-semibold text-(--color-fg)">Right now</span>
        <span className="ml-auto font-mono text-xs text-(--color-fg-subtle)">live · streaming</span>
      </div>
      <ul>
        {orgFeed.map((it, i) => (
          <li key={it.agent + i} className="flex items-center gap-3 border-b border-(--color-border)/60 px-5 py-2.5">
            <StateDot state={it.state} />
            <span className="w-20 shrink-0 font-mono text-xs text-(--color-fg-subtle)">{feedTimes[i]}</span>
            <span className="truncate text-sm">
              <span className="text-(--color-fg)">{it.agent}</span>
              <span className="text-(--color-fg-muted)"> · {it.action}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step metadata
// ---------------------------------------------------------------------------

export type Step = {
  n: string;
  label: string;
  title: string;
  points: string[];
  screen: React.ReactNode;
};

export const steps: Step[] = [
  {
    n: '01',
    label: 'Set up',
    title: 'Tell us what you do.',
    points: ['Describe your company, or just drop in your website.', 'We read it and provision your workspace.', 'No templates to wire up by hand.'],
    screen: <OnboardingScreen />,
  },
  {
    n: '02',
    label: 'Organize',
    title: 'A room for every team.',
    points: ['Deploy a room for engineering, sales, marketing, or ops.', 'Each room is a forum-style space with its own goal.', 'Add as many as your org needs.'],
    screen: <RoomTemplatesScreen />,
  },
  {
    n: '03',
    label: 'Staff',
    title: 'Hire a crew of agents.',
    points: ['Give each agent a name, a job, and a model.', 'Install a ready-made crew or build your own.', 'Pick exactly which tools each one can touch.'],
    screen: <AgentBuilderScreen />,
  },
  {
    n: '04',
    label: 'Connect',
    title: 'Wire in your tools and data.',
    points: ['Connect GitHub, Slack, HubSpot, your database.', 'Pin the docs and datasets agents should read.', 'Credentials stay server-side, never in a prompt.'],
    screen: <ConnectorsScreen />,
  },
  {
    n: '05',
    label: 'Direct',
    title: 'Set goals and triggers.',
    points: ['Set a goal per room; agents break it into work.', 'Trigger on a schedule, an event, or a threshold.', 'Or just message an agent and watch it go.'],
    screen: <DirectScreen />,
  },
  {
    n: '06',
    label: 'Operate',
    title: 'They work. You stay in control.',
    points: ['Watch every action stream into the live feed.', 'Approve anything irreversible before it happens.', 'See burn to the dollar, and halt anytime.'],
    screen: <FeedScreen />,
  },
];

// ---------------------------------------------------------------------------
// Shared layout pieces
// ---------------------------------------------------------------------------

export function Hero() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 pt-44 pb-16 sm:pt-52 sm:pb-20">
        <FadeIn>
          <p className="mb-4 text-xs font-brand uppercase tracking-widest text-(--color-fg-subtle)">How it works</p>
        </FadeIn>
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <FadeIn as="span" delay={80} className="block">
            From a sentence about your company
          </FadeIn>
          <FadeIn as="span" delay={160} className="block text-(--color-fg-muted)">
            to a company that runs itself.
          </FadeIn>
        </h1>
        <FadeIn delay={240}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
            A Starship is a virtual org you set up in an afternoon. Here is how it goes from empty to running, step by step.
          </p>
        </FadeIn>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <FadeIn delay={320}>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-5 py-3 text-sm font-medium text-(--color-bg) shadow-sm transition-colors hover:bg-(--color-accent-strong)"
            >
              Request demo
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </FadeIn>
          <FadeIn delay={380}>
            <a
              href="mailto:hello@starships.ai"
              className="inline-flex items-center justify-center rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) transition-colors hover:bg-(--color-bg-elev)"
            >
              hello@starships.ai
            </a>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

export function Closer() {
  return (
    <>
      <div className="pt-28 sm:pt-36">
        <FinalCTA />
      </div>
      <Footer />
    </>
  );
}
