import Link from 'next/link';
import { Logo } from '@/components/Logo';

export function Nav() {
  return (
    <header className="fixed top-8 left-0 right-0 z-50 px-4">
      <nav className="mx-auto max-w-5xl flex items-center justify-between rounded-full bg-black/30 backdrop-blur-xl pl-6 pr-4 py-3.5 sm:py-4">
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-3 text-(--color-fg) hover:opacity-80 transition-opacity">
            <Logo size={32} />
            <span className="font-brand text-2xl font-normal tracking-tight leading-none">
              Starships<span className="text-(--color-fg-muted)">.ai</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-7">
            <Link
              href="/#how-it-works"
              className="text-[15px] text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
            >
              How it works
            </Link>
            <Link
              href="/use-cases"
              className="text-[15px] text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
            >
              Use cases
            </Link>
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
