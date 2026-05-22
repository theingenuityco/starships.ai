'use client';

import { useEffect, useState } from 'react';
import { FadeIn } from './FadeIn';

type State = 'working' | 'done' | 'needs-you';
type Item = { id: number; time: Date; agent: string; action: string; state: State };

const pool: { agent: string; action: string; state: State }[] = [
  { agent: 'PR Reviewer', action: 'started review on #432', state: 'working' },
  { agent: 'Anomaly Watcher', action: 'flagged /api latency', state: 'needs-you' },
  { agent: 'Ticket Triager', action: 'closed #2018', state: 'done' },
  { agent: 'Account Researcher', action: 'enriched Acme Inc.', state: 'done' },
  { agent: 'Test Author', action: 'committed billing.test.ts', state: 'done' },
  { agent: 'Outreach Drafter', action: 'queued email to Bob', state: 'needs-you' },
  { agent: 'Status Reporter', action: 'posted daily summary', state: 'done' },
  { agent: 'KB Writer', action: 'published article #14', state: 'done' },
  { agent: 'Security Scanner', action: 'finished scan, no issues', state: 'done' },
  { agent: 'Docs Writer', action: 'updated /api/auth v2', state: 'done' },
  { agent: 'CRM Updater', action: 'synced 12 contacts', state: 'done' },
  { agent: 'Follow-up Coordinator', action: 'scheduled 3 follow-ups', state: 'working' },
  { agent: 'Dependency Upgrader', action: 'bumped 4 packages', state: 'done' },
  { agent: 'Campaign Planner', action: 'drafted Q3 sequence', state: 'working' },
];

type NavItem = { name: string; count?: string; active?: boolean; accent?: boolean };

const navItems: NavItem[] = [
  { name: 'Activity', count: '47/hr', active: true },
  { name: 'Rooms', count: '4' },
  { name: 'Approvals', count: '12', accent: true },
  { name: 'Audit log' },
  { name: 'Schedules' },
  { name: 'Settings' },
];

function fmtTime(d: Date) {
  return d.toTimeString().slice(0, 8);
}

function randomItem(id: number, when: Date): Item {
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { id, time: when, ...pick };
}

function StateDot({ state }: { state: State }) {
  if (state === 'done') return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-success)" />;
  if (state === 'working') return <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-(--color-warn)" />;
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />;
}

export function FeedDashboard() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const now = Date.now();
    setItems(Array.from({ length: 24 }, (_, i) => randomItem(now - i, new Date(now - i * 7000))));

    const id = setInterval(() => {
      setItems((prev) => [randomItem(Date.now(), new Date()), ...prev.slice(0, 23)]);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative bg-(--color-bg)">
      <div className="relative mx-auto max-w-7xl px-6 pt-12">
        {/* Wallpaper area */}
        <div
          className="relative h-[480px] overflow-hidden rounded-t-(--radius-card) sm:h-[560px]"
          style={{
            backgroundImage:
              'linear-gradient(180deg, rgba(7,8,11,0.45) 0%, rgba(7,8,11,0.75) 100%), url(/wallpaper.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
            {/* The Mac window, centered on the wallpaper, extending below */}
            <FadeIn className="absolute inset-x-8 top-8 sm:inset-x-16 sm:top-12">
              <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) shadow-2xl shadow-black/70">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f56]/85" />
                    <span className="h-3 w-3 rounded-full bg-[#ffbd2e]/85" />
                    <span className="h-3 w-3 rounded-full bg-[#27c93f]/85" />
                  </div>
                  <span className="ml-4 font-mono text-xs text-(--color-fg-subtle)">starships · operations</span>
                  <span className="ml-auto text-xs text-(--color-fg-subtle)">⌘K</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr]">
                  {/* Sidebar */}
                  <aside className="hidden border-r border-(--color-border) bg-(--color-bg-soft) p-3 md:block">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Workspace</p>
                    <div className="mt-1 space-y-0.5">
                      {navItems.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            item.active
                              ? 'bg-(--color-bg-elev) text-(--color-fg)'
                              : 'text-(--color-fg-muted) hover:bg-(--color-bg-elev)/60'
                          }`}
                        >
                          <span>{item.name}</span>
                          {item.count && (
                            <span
                              className={`rounded px-1.5 text-[10px] font-mono ${
                                item.accent ? 'bg-(--color-accent)/15 text-(--color-accent)' : 'text-(--color-fg-subtle)'
                              }`}
                            >
                              {item.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <p className="mt-6 px-2 py-1 text-[10px] uppercase tracking-wider text-(--color-fg-subtle)">Rooms</p>
                    <div className="mt-1 space-y-0.5">
                      {['Engineering', 'Sales', 'Ops', 'Marketing'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-(--color-fg-muted) hover:bg-(--color-bg-elev)/60"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
                          {r}
                        </button>
                      ))}
                    </div>
                  </aside>

                  {/* Main */}
                  <div>
                    <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-success)" />
                      <span className="text-sm font-semibold">Right now</span>
                      <div className="ml-4 hidden items-center gap-1 sm:flex">
                        {['All', 'Engineering', 'Sales', 'Ops'].map((f, i) => (
                          <span
                            key={f}
                            className={`rounded-md px-2 py-1 text-xs ${
                              i === 0 ? 'bg-(--color-bg) text-(--color-fg)' : 'text-(--color-fg-muted)'
                            }`}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                      <span className="ml-auto font-mono text-xs text-(--color-fg-subtle)">live · streaming</span>
                    </div>

                    <ul>
                      {items.map((it, i) => (
                        <li
                          key={it.id}
                          className="flex items-center gap-3 border-b border-(--color-border)/60 px-5 py-2.5 transition-opacity duration-500"
                          style={{ opacity: Math.max(0.55, 1 - i * 0.035) }}
                        >
                          <StateDot state={it.state} />
                          <span className="w-20 shrink-0 font-mono text-xs text-(--color-fg-subtle)">{fmtTime(it.time)}</span>
                          <span className="truncate text-sm">
                            <span className="text-(--color-fg)">{it.agent}</span>
                            <span className="text-(--color-fg-muted)"> · {it.action}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </FadeIn>

          {/* Bottom fade inside the wallpaper — softens the window's cut edge and blends into the page */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-(--color-bg)" />
        </div>
      </div>
    </section>
  );
}
