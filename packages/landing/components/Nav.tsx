'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/Icon';

const USE_CASES = [
  { label: 'All', href: '/use-cases' },
  { label: 'For developers', href: '/use-cases/for-developers' },
  { label: 'For marketers', href: '/use-cases/for-marketers' },
  { label: 'For sales', href: '/use-cases/for-sales' },
];

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
  return (
    <header className="fixed top-8 left-0 right-0 z-50 px-4">
      <nav className="mx-auto max-w-5xl flex items-center justify-between rounded-full bg-black/30 backdrop-blur-xl pl-6 pr-4 py-3.5 sm:py-4">
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-3 text-(--color-fg) hover:opacity-80 transition-opacity">
            <Logo size={32} />
            <span className="relative -top-0.5 font-brand text-2xl font-normal tracking-tight leading-none">
              Starships<span className="text-(--color-fg-muted)">.ai</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-7">
            <UseCasesDropdown />
          </div>
        </div>

        <Link
          href="/contact"
          className="rounded-full bg-(--color-accent) px-5 py-2.5 text-[15px] font-medium text-(--color-bg) shadow-sm hover:bg-(--color-accent-strong) transition-colors"
        >
          Request demo
        </Link>
      </nav>
    </header>
  );
}
