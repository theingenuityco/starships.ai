'use client';

import { useEffect, useState } from 'react';
import { AppWindow, type RoomEntry } from './AppWindow';

type State = 'working' | 'done' | 'needs-you';
type Item = { id: number; time: Date; agent: string; action: string; state: State };

export type FeedEntry = { agent: string; action: string; state: State };
export type { RoomEntry };

function fmtTime(d: Date) {
  return d.toTimeString().slice(0, 8);
}

function StateDot({ state }: { state: State }) {
  if (state === 'done') return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-success)" />;
  if (state === 'working')
    return <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-(--color-warn)" />;
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />;
}

type Props = {
  title: string;
  activeRoom: string;
  rooms: RoomEntry[];
  feedPool: FeedEntry[];
  wallpaper?: string;
};

export function RoomDashboard({ title, activeRoom, rooms, feedPool, wallpaper }: Props) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const rand = (id: number, when: Date): Item => {
      const pick = feedPool[Math.floor(Math.random() * feedPool.length)];
      return { id, time: when, ...pick };
    };
    const now = Date.now();
    setItems(Array.from({ length: 24 }, (_, i) => rand(now - i, new Date(now - i * 7000))));
    const id = setInterval(() => {
      setItems((prev) => [rand(Date.now(), new Date()), ...prev.slice(0, 23)]);
    }, 2200);
    return () => clearInterval(id);
    // feedPool is module-level and stable; empty dep array is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppWindow title={title} activeNav="Dashboard" rooms={rooms} activeRoom={activeRoom} wallpaper={wallpaper}>
      <div className="overflow-hidden border border-(--color-border) bg-(--color-bg) md:rounded-xl">
        <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-success)" />
          <span className="text-sm font-semibold">Right now</span>
          <div className="ml-4 hidden items-center gap-1 sm:flex">
            {['All', activeRoom].map((f, i) => (
              <span
                key={f}
                className={`rounded-md px-2 py-1 text-xs ${i === 0 ? 'text-(--color-fg-muted)' : 'bg-(--color-bg-soft) text-(--color-fg)'}`}
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
    </AppWindow>
  );
}
