import { Icon } from './Icon';

// Static marketing twin of the in-app EngineeringDashboard
// (packages/client/src/components/rooms/EngineeringDashboard.tsx). It mirrors the
// real product layout and uses the app's dark-theme palette (Tailwind's neutral
// scale ≈ the app's shadcn dark tokens: card #171717 = neutral-900, border
// #292929 ≈ neutral-800) so the landing window shows the actual product style.
// Kept visually in sync with the client component by hand (no shared package).

type Tone = 'neutral' | 'success' | 'info' | 'warn' | 'danger';

const TONE: Record<Tone, { bar: string; badge: string }> = {
  neutral: { bar: 'border-l-neutral-600', badge: 'bg-neutral-800 text-neutral-400 border-neutral-700' },
  success: { bar: 'border-l-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  info: { bar: 'border-l-sky-500', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  warn: { bar: 'border-l-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  danger: { bar: 'border-l-rose-500', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

const AGENT_COLOR: Record<string, string> = {
  Forge: 'bg-violet-500',
  Sift: 'bg-blue-500',
  Quill: 'bg-cyan-500',
  Anvil: 'bg-amber-500',
  Lens: 'bg-emerald-500',
};

type Card = { title: string; agent: string; meta: string; tone: Tone; mono?: boolean };
type Column = { title: string; cards: Card[] };

const COLUMNS: Column[] = [
  {
    title: 'Backlog',
    cards: [
      { title: 'Null deref in billing', agent: 'Sift', meta: '#318 · small · testable', tone: 'neutral' },
      { title: 'Flaky payments test', agent: 'Sift', meta: '#290 · small · testable', tone: 'neutral' },
      { title: 'Stale dep: zod 3 to 4', agent: 'Sift', meta: '#305 · chore', tone: 'neutral' },
    ],
  },
  {
    title: 'Scoped',
    cards: [
      { title: 'Retry on gateway timeout', agent: 'Quill', meta: 'spec ready', tone: 'info' },
      { title: 'Add refund edge cases', agent: 'Quill', meta: 'spec ready', tone: 'info' },
    ],
  },
  {
    title: 'Building',
    cards: [{ title: 'fix/billing-null', agent: 'Anvil', meta: 'running suite · 142/142', tone: 'warn', mono: true }],
  },
  {
    title: 'In review',
    cards: [
      { title: '#441 null deref fix', agent: 'Lens', meta: 'checks green · +38 −4', tone: 'success' },
      { title: '#438 payments retry', agent: 'Lens', meta: 'needs a test', tone: 'warn' },
    ],
  },
  {
    title: 'Merged',
    cards: [{ title: '#439 cache on logout', agent: 'Anvil', meta: 'merged · 2h ago', tone: 'success' }],
  },
  {
    title: 'Blocked',
    cards: [{ title: 'OAuth token refresh', agent: 'Forge', meta: 'needs a secret', tone: 'danger' }],
  },
];

const STATS: { label: string; value: string; icon: string; tone: Tone }[] = [
  { label: 'In flight', value: '7', icon: 'activity', tone: 'info' },
  { label: 'Awaiting you', value: '2', icon: 'eye', tone: 'warn' },
  { label: 'Merged this week', value: '12', icon: 'check-circle', tone: 'success' },
  { label: 'Burn today', value: '$3.40', icon: 'coins', tone: 'neutral' },
];

const APPROVALS: { agent: string; text: string; primary: string; secondary: string; tone: Tone }[] = [
  { agent: 'Anvil', text: 'wants to open a PR for fix/billing-null. 142 tests passed.', primary: 'Approve', secondary: 'View diff', tone: 'success' },
  { agent: 'Lens', text: 'flagged a missing test on #438 before it can merge.', primary: 'Review', secondary: 'Dismiss', tone: 'warn' },
];

const SHIPPED: { pr: string; title: string; add: number; del: number; when: string }[] = [
  { pr: '#439', title: 'Cache invalidation on logout', add: 24, del: 6, when: '2h ago' },
  { pr: '#437', title: 'Bump zod to 4.0', add: 112, del: 98, when: '5h ago' },
  { pr: '#431', title: 'Null guard in webhook handler', add: 9, del: 2, when: '1d ago' },
];

const CREW: { name: string; status: string; working?: boolean }[] = [
  { name: 'Forge', status: 'routing work' },
  { name: 'Sift', status: 'idle' },
  { name: 'Quill', status: 'writing spec' },
  { name: 'Anvil', status: 'running tests', working: true },
  { name: 'Lens', status: 'reviewing #441' },
];

function AgentChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
          AGENT_COLOR[name] ?? 'bg-neutral-600'
        }`}
      >
        {name.slice(0, 1)}
      </span>
      <span className="text-xs font-medium text-neutral-100">{name}</span>
    </span>
  );
}

export function EngineeringDashboardMock() {
  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-neutral-100 md:rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm text-neutral-400">
          <Icon name="arrow-left" className="h-4 w-4" />
          Engineering
        </span>
        <span className="text-neutral-600">/</span>
        <span className="text-sm font-medium">Dashboard</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
          <Icon name="clock" className="h-3 w-3" />
          Runs on a schedule
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${TONE[s.tone].badge}`}>
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-none tabular-nums">{s.value}</p>
                <p className="mt-1 truncate text-xs text-neutral-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="list" className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-sm font-semibold">Pipeline</span>
            </div>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TONE.info.badge}`}>7 in flight</span>
          </div>
          <div className="flex gap-3 overflow-x-auto p-4">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex w-[180px] shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{col.title}</span>
                  <span className="font-mono text-[11px] text-neutral-400">{col.cards.length}</span>
                </div>
                {col.cards.map((card) => (
                  <div
                    key={card.title}
                    className={`rounded-md border border-l-2 border-neutral-800 bg-neutral-950 p-2.5 ${TONE[card.tone].bar}`}
                  >
                    <p className={`text-sm leading-snug text-neutral-100 ${card.mono ? 'font-mono text-[13px]' : ''}`}>{card.title}</p>
                    <div className="mt-2">
                      <AgentChip name={card.agent} />
                    </div>
                    <p className="mt-1.5 truncate text-[11px] text-neutral-400">{card.meta}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Needs you + Shipped */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="eye" className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-sm font-semibold">Needs you</span>
              </div>
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TONE.warn.badge}`}>2 waiting</span>
            </div>
            <div>
              {APPROVALS.map((a) => (
                <div key={a.agent} className="flex flex-col gap-2.5 border-b border-neutral-800 px-4 py-3 last:border-0">
                  <p className="text-sm leading-relaxed text-neutral-400">
                    <span className="font-medium text-neutral-100">{a.agent}</span> {a.text}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${TONE[a.tone].badge}`}>{a.primary}</span>
                    <span className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-400">{a.secondary}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="check-circle" className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-sm font-semibold">Shipped</span>
              </div>
              <span className="text-xs text-neutral-400">12 this week · all green</span>
            </div>
            <div>
              {SHIPPED.map((s) => (
                <div key={s.pr} className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2.5 last:border-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <Icon name="check" className="h-3 w-3 text-emerald-400" />
                  </span>
                  <span className="font-mono text-xs text-neutral-400">{s.pr}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{s.title}</span>
                  <span className="font-mono text-xs text-emerald-400">+{s.add}</span>
                  <span className="font-mono text-xs text-rose-400">−{s.del}</span>
                  <span className="hidden w-16 shrink-0 text-right text-xs text-neutral-400 sm:block">{s.when}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Crew */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Crew</span>
          <div className="flex flex-1 flex-wrap gap-2">
            {CREW.map((m) => (
              <span
                key={m.name}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${m.working ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-800'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${m.working ? 'animate-pulse bg-amber-500' : 'bg-neutral-600'}`} />
                <span className="text-xs font-medium text-neutral-100">{m.name}</span>
                <span className="text-[11px] text-neutral-400">{m.status}</span>
              </span>
            ))}
          </div>
          <span className="font-mono text-xs text-neutral-400">1.2M tokens · $3.40</span>
        </div>
      </div>
    </div>
  );
}
