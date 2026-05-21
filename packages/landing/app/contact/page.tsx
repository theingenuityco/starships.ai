import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Request demo — Starships',
  description: "Tell us what you're building. We'll reply with a booking link.",
};

export default function ContactPage() {
  return (
    <main className="pt-24">
      <ContactForm />
      <Footer />
    </main>
  );
}
