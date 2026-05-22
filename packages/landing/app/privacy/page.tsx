import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — Starships',
  description: 'How Starships collects, uses, and protects your personal information.',
};

export const dynamic = 'force-static';
export const revalidate = 3600;

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Data controller',
    body: (
      <>
        <p>
          Starships (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the starships.ai website. The data controller responsible for personal information collected through this site is:
        </p>
        <address className="mt-4 not-italic space-y-0.5">
          <p className="font-medium text-(--color-fg)">Starships</p>
          <p>8 The Green, Suite B</p>
          <p>Dover, DE 19901</p>
          <p>United States</p>
          <p className="mt-2">
            <a href="mailto:tech@starships.ai" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
              tech@starships.ai
            </a>
          </p>
        </address>
      </>
    ),
  },
  {
    title: 'Information we collect',
    body: (
      <ul className="space-y-3">
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>Contact details from the demo request form: name, work email, company name, and any message you include.</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>Basic usage data collected automatically: IP address, browser type, pages visited, and referrer. Used only to operate and improve the site.</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>Any information you choose to share with us directly via email.</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'How we use it',
    body: (
      <ul className="space-y-3">
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>To respond to your demo request and schedule a conversation.</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>To send you information about Starships relevant to your enquiry.</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>To understand how people use the site so we can improve it.</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
          <span>To comply with any legal obligations that apply to us.</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'Legal basis (EEA / UK)',
    body: (
      <p>
        Where EU, EEA, or UK data protection law applies, we process your data on the basis of legitimate interests (responding to your enquiry and improving the site), performance of a
        pre-contractual step (scheduling a demo), and, where required, your explicit consent. You may withdraw consent at any time by contacting us.
      </p>
    ),
  },
  {
    title: 'AI training and your content',
    body: (
      <p>
        We do not use information you submit through this site — including your name, email, company details, or any message you write — to train AI models. Your data is yours. We may use
        aggregate, anonymised statistics derived from site usage to improve our systems, provided such information cannot identify you.
      </p>
    ),
  },
  {
    title: 'Sharing your information',
    body: (
      <>
        <p className="mb-4">We do not sell, rent, or trade your personal information. We may share it only with:</p>
        <ul className="space-y-3">
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Email delivery providers used to send and receive correspondence (e.g., Amazon SES).</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Analytics services that help us understand site usage, configured to minimise personal data collection.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle)" />
            <span>Professional advisers or competent authorities when required by law.</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Data security',
    body: (
      <p>
        We implement technical and organisational measures designed to protect personal data against accidental or unlawful destruction, loss, alteration, unauthorised disclosure, or access. These
        include encryption in transit, access controls, and security monitoring. No method of transmission or storage is completely secure; we cannot guarantee absolute security.
      </p>
    ),
  },
  {
    title: 'Data retention',
    body: (
      <p>
        We retain contact form submissions and related correspondence for as long as reasonably necessary to follow up on your enquiry and maintain a record of our communications, typically no
        longer than two years unless you become a customer or request deletion sooner.
      </p>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <p>
        Subject to applicable law, you may request access to, correction of, or deletion of personal data we hold about you. You may also object to or ask us to restrict certain processing. To
        exercise any of these rights, email{' '}
        <a href="mailto:tech@starships.ai" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
          tech@starships.ai
        </a>
        . We will respond within the timeframe required by applicable law.
      </p>
    ),
  },
  {
    title: 'Cookies',
    body: (
      <p>
        We use only essential cookies required to operate the site. We do not use third-party advertising or tracking cookies. Basic analytics may use first-party cookies or cookieless measurement
        methods.
      </p>
    ),
  },
  {
    title: 'International transfers',
    body: (
      <p>
        We operate primarily from India. If you access the site from the EEA, UK, or other regions with data transfer restrictions, your information may be processed in countries with different
        data protection rules. We take reasonable steps to ensure appropriate protections are in place, such as Standard Contractual Clauses where required.
      </p>
    ),
  },
  {
    title: "Children's data",
    body: (
      <p>
        This site is not directed at children under the age of 13, and we do not knowingly collect personal data from anyone under 13. If you believe we have inadvertently collected such data,
        please contact us at{' '}
        <a href="mailto:tech@starships.ai" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
          tech@starships.ai
        </a>{' '}
        and we will delete it promptly.
      </p>
    ),
  },
  {
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the date at the top of this page. For material changes, we will make reasonable efforts to notify you
        directly if we hold your contact details. Continued use of the site after changes are posted constitutes your acceptance of the updated policy.
      </p>
    ),
  },
  {
    title: 'Contact',
    body: (
      <>
        <p className="mb-4">
          For questions about this Privacy Policy or our handling of personal data, contact us at:
        </p>
        <address className="not-italic space-y-0.5">
          <p className="font-medium text-(--color-fg)">Starships</p>
          <p>8 The Green, Suite B</p>
          <p>Dover, DE 19901</p>
          <p>United States</p>
          <p className="mt-2">
            <a href="mailto:tech@starships.ai" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
              tech@starships.ai
            </a>
          </p>
        </address>
        <p className="mt-4">
          For the terms governing use of this site, see our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-(--color-fg) transition-colors">
            Terms of Use
          </Link>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="pt-32 pb-24">
      <div className="mx-auto max-w-5xl px-6">
        <header className="mb-16 pb-12 border-b border-(--color-border)">
          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-(--color-fg)">Privacy Policy</h1>
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
