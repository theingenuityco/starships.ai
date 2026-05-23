import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { MarketingMotif, EngineeringMotif, SalesMotif } from '@/components/MotifOptions';
import { SectionReveal, ChainItem } from '@/components/SectionReveal';

export const metadata: Metadata = {
  title: 'Use Cases — Starships',
  description: 'How engineering, marketing, and sales teams run on Starships.',
};

export const dynamic = 'force-static';

// Maps display name → /integrations/{slug}.svg
const integrationSlug: Record<string, string> = {
  HubSpot: 'hubspot',
  Gmail: 'gmail',
  Stripe: 'stripe',
  Notion: 'notion',
  Zoho: 'zoho',
  GitHub: 'github',
  GitLab: 'gitlab',
  Linear: 'linear',
  Jira: 'jira',
  Sentry: 'sentry',
  Mailchimp: 'mailchimp',
  Mixpanel: 'mixpanel',
  Intercom: 'intercom',
  Datadog: 'datadog',
};

const sections = [
  {
    heading: 'For sales.',
    body: ['Leads researched before your first call.', 'CRM updated after every interaction.', 'Follow-ups queued before anything goes cold.'],
    integrations: ['HubSpot', 'Gmail', 'Stripe', 'Notion', 'Zoho'],
    agents: ['Account Researcher', 'CRM Updater', 'Follow-up Coordinator', 'Ticket Triager'],
    href: '/for-sales',
    cta: 'See the Sales room',
    motif: <SalesMotif />,
  },
  {
    heading: 'For developers.',
    body: ['Every PR reviewed before a human opens it.', 'Tests written alongside new features.', 'Dependencies upgraded on a clean weekly PR.'],
    integrations: ['GitHub', 'GitLab', 'Linear', 'Jira', 'Sentry'],
    agents: ['PR Reviewer', 'Test Author', 'Security Scanner', 'Dependency Upgrader'],
    href: '/for-developers',
    cta: 'See the Engineering room',
    motif: <EngineeringMotif />,
  },
  {
    heading: 'For marketers.',
    body: ['Outreach drafted the moment a lead enters your CRM.', 'KB articles published when a ticket resolves.', 'Morning updates sent without a single keystroke.'],
    integrations: ['HubSpot', 'Mailchimp', 'Mixpanel', 'Intercom', 'Notion'],
    agents: ['Outreach Drafter', 'Campaign Planner', 'KB Writer', 'Status Reporter'],
    href: '/for-marketers',
    cta: 'See the Marketing room',
    motif: <MarketingMotif />,
  },
];

export default function UseCasesPage() {
  return (
    <main className="pt-32 pb-0">
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <FadeIn>
          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Use Cases</p>
        </FadeIn>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          <FadeIn as="span" delay={60} className="block">One platform.</FadeIn>
          <FadeIn as="span" delay={120} className="block text-(--color-fg-muted)">Every team.</FadeIn>
        </h1>
        <FadeIn delay={200}>
          <p className="mt-6 max-w-xl text-lg text-(--color-fg-muted) leading-relaxed">
            Starships runs across your whole org. Each team gets their own room, their own agents, and their own goals, all working while you sleep.
          </p>
        </FadeIn>
      </div>

      {sections.map((s) => (
        <section key={s.heading} className="bg-(--color-bg)">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <SectionReveal>
              <ChainItem
                as="h2"
                delay={0}
                className="text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl mb-16 sm:mb-20"
              >
                {s.heading}
              </ChainItem>

              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">

                <ChainItem delay={80} className="w-full max-w-sm mx-auto lg:mx-0">
                  {s.motif}
                </ChainItem>

                <div>
                  <ChainItem delay={160}>
                    <ul className="space-y-2">
                      {s.body.map((line) => (
                        <li key={line} className="flex items-start gap-2.5 text-lg text-(--color-fg-muted) leading-relaxed">
                          <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-(--color-fg-subtle)" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </ChainItem>

                  <ChainItem delay={240}>
                    <div className="mt-6">
                      <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-3">Works with</p>
                      <div className="flex flex-wrap gap-2">
                        {s.integrations.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2.5 py-1 text-xs font-medium text-(--color-fg-muted)"
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                              <img
                                src={`/integrations/${integrationSlug[name]}.svg`}
                                alt={name}
                                className="h-3.5 w-3.5 opacity-60"
                              />
                            </span>
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </ChainItem>

                  <ChainItem delay={320}>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {s.agents.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center rounded-full border border-(--color-border) px-3 py-1 text-sm text-(--color-fg-subtle)"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </ChainItem>

                  <ChainItem delay={400}>
                    <Link
                      href={s.href}
                      className="mt-8 inline-flex items-center gap-2 rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-elev) transition-colors"
                    >
                      {s.cta} →
                    </Link>
                  </ChainItem>
                </div>

              </div>
            </SectionReveal>
          </div>
        </section>
      ))}

      <Footer />
    </main>
  );
}
