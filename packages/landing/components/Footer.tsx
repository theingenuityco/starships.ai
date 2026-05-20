import { Logo } from '@/components/Logo';

export function Footer() {
  return (
    <footer className="border-t border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-(--color-fg-muted)">
          <Logo size={18} />
          <span className="font-brand text-base text-(--color-fg) tracking-tight leading-none">
            Starships<span className="text-(--color-fg-subtle)">.ai</span>
          </span>
          <span className="text-(--color-fg-subtle)">&copy; {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-(--color-fg-muted)">
          <a href="mailto:hello@starships.ai" className="hover:text-(--color-fg) transition-colors">
            hello@starships.ai
          </a>
          <a href="/contact" className="hover:text-(--color-fg) transition-colors">
            Book a call
          </a>
        </div>
      </div>
    </footer>
  );
}
