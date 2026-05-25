import { Logo } from '@/components/Logo';

export function Footer() {
  return (
    <footer className="border-t border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="flex flex-col sm:flex-row justify-between gap-12">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Logo size={24} />
              <span className="font-brand text-xl tracking-tight leading-none">
                Starships<span className="text-(--color-fg-subtle)">.ai</span>
              </span>
            </div>
            <p className="text-(--color-fg-subtle) leading-relaxed max-w-xs">Your startup, on autopilot.</p>
            <p className="text-xs text-(--color-fg-subtle)">
              &copy; {new Date().getFullYear()} Starships.ai | Manifested by{' '}
              <a href="https://theingenuity.co" target="_blank" rel="noopener noreferrer" className="hover:text-(--color-fg-muted) transition-colors">
                The Ingenuity Co
              </a>
            </p>
          </div>

          <div className="flex flex-wrap gap-12 sm:gap-16">
            <div className="flex flex-col gap-4">
              <span className="text-xs font-medium uppercase tracking-widest text-(--color-fg-subtle)">Product</span>
              <a href="/how-it-works" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                How it works
              </a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-xs font-medium uppercase tracking-widest text-(--color-fg-subtle)">Use cases</span>
              <a href="/use-cases/for-marketers" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Marketers
              </a>
              <a href="/use-cases/for-developers" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Developers
              </a>
              <a href="/use-cases/for-sales" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Sales
              </a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-xs font-medium uppercase tracking-widest text-(--color-fg-subtle)">Contact</span>
              <a href="mailto:hello@starships.ai" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                hello@starships.ai
              </a>
              <a href="/request-demo" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Request demo
              </a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-xs font-medium uppercase tracking-widest text-(--color-fg-subtle)">Legal</span>
              <a href="/terms" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Terms
              </a>
              <a href="/privacy" className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
                Privacy
              </a>
            </div>
          </div>
        </div>


      </div>
    </footer>
  );
}
