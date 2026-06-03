'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/Icon';

const USE_CASES = [
  { label: 'All', href: '/use-cases' },
  { label: 'For developers', href: '/use-cases/for-developers' },
  { label: 'For marketers', href: '/use-cases/for-marketers' },
  { label: 'For sales', href: '/use-cases/for-sales' },
];

// Carry the room context when the demo CTA is clicked from a use-case page, so
// the request-demo form prefills the right room.
const ROOM_BY_PATH: Record<string, string> = {
  '/use-cases/for-developers': 'engineering',
  '/use-cases/for-sales': 'sales',
  '/use-cases/for-marketers': 'marketing',
};

function UseCasesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1 text-[15px] text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
      >
        Use cases
        <Icon
          name="chevron-down"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 min-w-[180px] rounded-(--radius-card) border border-white/10 bg-black/88 backdrop-blur-xl p-1.5 shadow-lg shadow-black/40">
          {USE_CASES.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-(--radius-button) px-3.5 py-2 text-[15px] text-(--color-fg-muted) hover:bg-(--color-border-strong)/60 hover:text-(--color-fg) transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const room = ROOM_BY_PATH[pathname];
  const demoHref = room ? `/request-demo?room=${room}` : '/request-demo';

  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu whenever navigation lands on a new route.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock background scroll while the fullscreen mobile menu is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <header className="fixed top-8 left-0 right-0 z-50 px-4">
      <nav
        className={`relative z-10 mx-auto max-w-5xl flex items-center justify-between rounded-full pl-6 pr-4 py-3.5 sm:py-4 sm:bg-black/30 sm:backdrop-blur-xl ${
          mobileOpen ? 'bg-transparent backdrop-blur-none' : 'bg-black/30 backdrop-blur-xl'
        }`}
      >
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-3 text-(--color-fg) hover:opacity-80 transition-opacity">
            <Logo size={32} />
            <span className="relative -top-0.5 font-brand text-2xl font-normal tracking-tight leading-none">
              Starships<span className="text-(--color-fg-muted)">.ai</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-7">
            <Link
              href="/how-it-works"
              className="text-[15px] text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
            >
              How it works
            </Link>
            <UseCasesDropdown />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={demoHref}
            className="hidden sm:inline-flex rounded-full bg-(--color-accent) px-5 py-2.5 text-[15px] font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
          >
            Request demo
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-white/5 transition-colors sm:hidden"
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {/* Mobile menu — a fullscreen sheet that reads like the navbar expanding open */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-0 flex flex-col bg-black/30 backdrop-blur-xl px-6 pt-28 pb-10">
          <nav className="flex flex-col">
            <Link
              href="/how-it-works"
              className="border-b border-white/10 py-5 text-3xl font-semibold tracking-tight text-(--color-fg) transition-opacity hover:opacity-70"
            >
              How it works
            </Link>

            <div className="border-b border-white/10 py-5">
              <Link
                href="/use-cases"
                className="block text-3xl font-semibold tracking-tight text-(--color-fg) transition-opacity hover:opacity-70"
              >
                Use cases
              </Link>
              <div className="mt-3 flex flex-col gap-2.5">
                {USE_CASES.filter(({ href }) => href !== '/use-cases').map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-xl text-(--color-fg-muted) transition-colors hover:text-(--color-fg)"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          <Link
            href={demoHref}
            className="mt-auto flex items-center justify-center rounded-full bg-(--color-accent) px-6 py-4 text-lg font-medium text-(--color-bg) shadow-sm transition-colors hover:bg-(--color-accent-strong)"
          >
            Request demo
          </Link>
        </div>
      )}
    </header>
  );
}
