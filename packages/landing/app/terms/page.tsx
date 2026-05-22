import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Use — Starships',
  description: 'The terms that govern your use of the Starships website.',
};

export const dynamic = 'force-static';
export const revalidate = 3600;

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Acceptance',
    body: (
      <p>
        By accessing or using the starships.ai website (&quot;Site&quot;), you agree to be bound by these Terms of Use (&quot;Terms&quot;). If you do not agree, please do not use the Site. We may
        update these Terms from time to time; continued use of the Site after changes are posted constitutes your acceptance of the revised Terms.
      </p>
    ),
  },
  {
    title: 'About the service',
    body: (
      <p>
        Starships is an AI automation platform that enables teams to build, deploy, and manage autonomous AI agents and workflows. The Site is a marketing and pre-sales resource. We may modify or
        update the platform and this Site from time to time without prior notice.
      </p>
    ),
  },
  {
    title: 'Use of the site',
    body: (
      <>
        <p className="mb-4">You may use the Site for lawful purposes only. You agree not to:</p>
        <ul className="space-y-3">
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Use the Site in any way that violates applicable laws or regulations.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Attempt to gain unauthorised access to any part of the Site or its infrastructure.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Transmit any unsolicited or unauthorised advertising or promotional material.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Scrape, crawl, or systematically extract content from the Site without our prior written consent.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Transmit malicious code, viruses, or any other harmful components.</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Demo requests',
    body: (
      <p>
        When you submit a demo request through the Site, you confirm that the information you provide is accurate and that you have authority to act on behalf of any company you name. Submitting a
        request does not create any binding agreement or obligation on either party. We reserve the right to decline any request at our discretion.
      </p>
    ),
  },
  {
    title: 'Intellectual property',
    body: (
      <p>
        The Site and its content — including text, graphics, logos, animations, and software — are owned by or licensed to Starships and are protected by applicable intellectual property laws. You
        may not reproduce, distribute, or create derivative works from any Site content without our prior written permission.
      </p>
    ),
  },
  {
    title: 'Data usage and AI training',
    body: (
      <p>
        We do not use information you submit through this Site to train AI models. Your data remains yours. Aggregate, anonymised usage statistics may be used to operate and improve our platform,
        provided such information cannot identify you. Further details on how we handle personal data are in our{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    title: 'Third-party links',
    body: (
      <p>
        The Site may contain links to third-party websites for convenience only. We have no control over those sites and accept no responsibility for their content, or for any loss or damage that
        may arise from your use of them.
      </p>
    ),
  },
  {
    title: 'Service availability',
    body: (
      <p>
        We aim to keep the Site available but do not guarantee uninterrupted or error-free access. We may modify, suspend, or take the Site offline at any time, with or without notice, and are not
        liable for any unavailability or modification of the Site except to the extent required by applicable law.
      </p>
    ),
  },
  {
    title: 'Disclaimer of warranties',
    body: (
      <p>
        The Site is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind, express or implied, including but not limited to warranties of
        merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Site will be uninterrupted, error-free, or free of viruses or other harmful components.
      </p>
    ),
  },
  {
    title: 'Limitation of liability',
    body: (
      <p>
        To the fullest extent permitted by law, Starships and its affiliates, directors, employees, and agents will not be liable for any indirect, incidental, special, consequential, or punitive
        damages, or any loss of profits, revenues, data, or goodwill, arising out of or in connection with your use of the Site, even if advised of the possibility of such damages.
      </p>
    ),
  },
  {
    title: 'Governing law and disputes',
    body: (
      <>
        <p>
          These Terms are governed by and construed in accordance with the laws of India, without regard to conflict of law principles. Before initiating formal proceedings, the parties will
          attempt to resolve disputes in good faith. Disputes that cannot be resolved informally may be submitted to a court of competent jurisdiction in India.
        </p>
        <p className="mt-4">
          If you are a consumer resident in the EU or EEA, you retain the right to bring disputes before the courts in your country of residence and to access the EU Online Dispute Resolution
          platform at{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>
      </>
    ),
  },
  {
    title: 'Privacy',
    body: (
      <p>
        Your use of the Site is also governed by our{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
          Privacy Policy
        </Link>
        , which is incorporated into these Terms by reference.
      </p>
    ),
  },
  {
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these Terms from time to time. When we make material changes, we will update the date below and, where reasonable, provide notice via the Site or by email if we hold your
        contact details. Your continued use of the Site after the effective date of any changes constitutes your acceptance of the updated Terms.
      </p>
    ),
  },
  {
    title: 'Contact',
    body: (
      <>
        <p className="mb-4">If you have any questions about these Terms, contact us at:</p>
        <address className="not-italic space-y-0.5">
          <p className="font-medium text-(--color-fg)">Starships</p>
          <p>8 The Green, Suite B</p>
          <p>Dover, DE 19901</p>
          <p>United States</p>
          <p className="mt-2">
            <a href="mailto:hello@starships.ai" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
              hello@starships.ai
            </a>
          </p>
        </address>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="pt-32 pb-24">
      <div className="mx-auto max-w-5xl px-6">
        <header className="mb-16 pb-12 border-b border-(--color-border)">
          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-(--color-fg)">Terms of Use</h1>
          <p className="mt-4 text-(--color-fg-subtle) text-sm">Last updated: May 2026</p>
        </header>

        <div className="divide-y divide-(--color-border)">
          {sections.map((section, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-6 sm:gap-16 py-12">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-brand text-(--color-fg-subtle) tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="text-base font-semibold text-(--color-fg)">{section.title}</h2>
              </div>
              <div className="text-[15px] leading-relaxed text-(--color-fg-muted)">{section.body}</div>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  );
}
