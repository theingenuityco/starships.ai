import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Book a call — Starships',
  description: "Tell us what you're building and we'll send a booking link to your inbox.",
};

export default function ContactPage() {
  return (
    <main>
      <nav className="border-b border-(--color-border) bg-(--color-bg)">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center">
          <a href="/" className="flex items-center gap-2 text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors">
            <span className="inline-block h-2 w-2 rounded-full bg-(--color-accent)" />
            <span>Starships</span>
          </a>
        </div>
      </nav>
      <ContactForm />
      <Footer />
    </main>
  );
}
