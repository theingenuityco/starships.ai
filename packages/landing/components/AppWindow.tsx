'use client';

import { FadeIn } from './FadeIn';
import { Icon } from './Icon';
import { Logo } from './Logo';

export type RoomEntry = { name: string; unread?: number };

const navItems = [
  { name: 'Dashboard', icon: 'dashboard' },
  { name: 'Datasets', icon: 'database' },
  { name: 'Tasks', icon: 'list' },
  { name: 'Docs', icon: 'file-text' },
  { name: 'Agents', icon: 'bot' },
  { name: 'Connectors', icon: 'plug' },
];

type Props = {
  title: string;
  activeNav?: string;
  rooms?: RoomEntry[];
  activeRoom?: string;
  wallpaper?: string;
  showSidebar?: boolean;
  children: React.ReactNode;
};

// The shared "product window" chrome used across the landing mockups: a wallpaper
// desktop, a window with a title bar, and an optional app sidebar. The main pane
// content is supplied by the caller so each surface can show a different screen.
export function AppWindow({ title, activeNav = 'Dashboard', rooms, activeRoom, wallpaper, showSidebar = true, children }: Props) {
  return (
    <section className="relative bg-(--color-bg)">
      <div className="relative mx-auto max-w-7xl px-6 pt-12">
        <FadeIn
          className="dashboard-desktop relative h-[480px] overflow-hidden rounded-t-(--radius-card) sm:h-[560px]"
          style={{
            backgroundImage: wallpaper ?? 'linear-gradient(180deg, rgba(7,8,11,0.45) 0%, rgba(7,8,11,0.75) 100%), url(/wallpaper.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div
            className="dashboard-window absolute inset-x-4 top-6 sm:inset-x-16 sm:top-12"
            style={{ '--delay': '400ms' } as React.CSSProperties}
          >
            <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) shadow-2xl shadow-black/70">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f56]/85" />
                  <span className="h-3 w-3 rounded-full bg-[#ffbd2e]/85" />
                  <span className="h-3 w-3 rounded-full bg-[#27c93f]/85" />
                </div>
                <span className="ml-4 font-mono text-xs text-(--color-fg-subtle)">{title}</span>
                <span className="ml-auto text-xs text-(--color-fg-subtle)">⌘K</span>
              </div>

              <div className="flex">
                {showSidebar && (
                  <aside className="hidden w-[212px] shrink-0 flex-col md:flex">
                    <div className="flex items-center gap-1 px-3 pt-4 pb-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-(--color-fg) transition-colors hover:bg-(--color-bg-soft)"
                      >
                        <Logo size={18} className="shrink-0 text-(--color-fg)" />
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium tracking-tight">Acme Inc.</span>
                        <Icon name="chevron-down" className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
                      </button>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-(--color-fg-subtle) transition-colors hover:bg-(--color-bg-soft) hover:text-(--color-fg)"
                      >
                        <Icon name="bell" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-(--color-fg-subtle) transition-colors hover:bg-(--color-bg-soft) hover:text-(--color-fg)"
                      >
                        <Icon name="sidebar" className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mx-2 h-px bg-(--color-border)" />

                    <nav className="space-y-0.5 px-2 pt-3">
                      {navItems.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          className={`flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors ${
                            item.name === activeNav
                              ? 'bg-(--color-accent-soft) text-(--color-fg)'
                              : 'text-(--color-fg-muted) hover:bg-(--color-bg-soft) hover:text-(--color-fg)'
                          }`}
                        >
                          <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.name}</span>
                        </button>
                      ))}
                    </nav>

                    {rooms ? (
                      <>
                        <div className="mx-2 my-3 h-px bg-(--color-border)" />
                        <div className="px-2">
                          <div className="flex items-center justify-between px-1 pb-1">
                            <span className="text-[11px] font-medium text-(--color-fg-muted)">Rooms</span>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-(--color-fg-subtle) transition-colors hover:bg-(--color-bg-soft) hover:text-(--color-fg)"
                            >
                              <Icon name="plus" className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-0.5">
                            {rooms.map((r) => (
                              <button
                                key={r.name}
                                type="button"
                                className={`flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors ${
                                  r.name === activeRoom
                                    ? 'bg-(--color-accent-soft) text-(--color-fg)'
                                    : 'text-(--color-fg-muted) hover:bg-(--color-bg-soft) hover:text-(--color-fg)'
                                }`}
                              >
                                <Icon name="hash" className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>
                                {r.unread ? (
                                  <span className="inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500/90 px-1 text-[9px] font-semibold leading-none text-white">
                                    {r.unread}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div className="flex-1" />

                    <div className="border-t border-(--color-border) px-3 py-3">
                      <div className="flex items-center gap-2 rounded-lg px-1 py-0.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-bg-soft) text-[11px] font-semibold text-(--color-fg)">
                          JR
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight text-(--color-fg)">Jordan Reyes</span>
                          <span className="block truncate text-[10.5px] leading-tight text-(--color-fg-subtle)">jordan@acme.co</span>
                        </span>
                        <Icon name="chevron-up" className="h-3.5 w-3.5 shrink-0 text-(--color-fg-subtle)" />
                      </div>
                    </div>
                  </aside>
                )}

                {/* Main content */}
                <div className={showSidebar ? 'min-w-0 flex-1 p-0 md:py-3 md:pr-3 md:pl-0' : 'min-w-0 flex-1 p-3 sm:p-5'}>{children}</div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-(--color-bg)" />
        </FadeIn>
      </div>
    </section>
  );
}
