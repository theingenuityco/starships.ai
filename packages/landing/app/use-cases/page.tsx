import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { MarketingMotif, EngineeringMotif, SalesMotif } from '@/components/MotifOptions';
import { SectionReveal, ChainItem } from '@/components/SectionReveal';

export const metadata: Metadata = {
  title: 'Use Cases — Starships',
  description: 'How engineering, marketing, and sales teams run on Starships.',
};

export const dynamic = 'force-static';

const agentIcon: Record<string, string> = {
  // Sales
  'Account Researcher': 'search',
  'CRM Updater': 'database',
  'Follow-up Coordinator': 'clock',
  'Ticket Triager': 'list',
  // Developers
  'PR Reviewer': 'git-branch',
  'Test Author': 'check',
  'Security Scanner': 'shield',
  'Dependency Upgrader': 'package',
  // Marketers
  'Outreach Drafter': 'mail',
  'Campaign Planner': 'calendar',
  'KB Writer': 'file-text',
  'Status Reporter': 'dashboard',
};

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
    body: [
      'Leads researched before your first call.',
      'CRM updated after every interaction.',
      'Follow-ups queued before anything goes cold.',
    ],
    integrations: ['HubSpot', 'Gmail', 'Stripe', 'Notion', 'Zoho'],
    agents: ['Account Researcher', 'CRM Updater', 'Follow-up Coordinator', 'Ticket Triager'],
    href: '/use-cases/for-sales',
    cta: 'See the Sales room',
    motif: <SalesMotif />,
  },
  {
    heading: 'For developers.',
    body: [
      'Every PR reviewed before a human opens it.',
      'Tests written alongside new features.',
      'Dependencies upgraded on a clean weekly PR.',
    ],
    integrations: ['GitHub', 'GitLab', 'Linear', 'Jira', 'Sentry'],
    agents: ['PR Reviewer', 'Test Author', 'Security Scanner', 'Dependency Upgrader'],
    href: '/use-cases/for-developers',
    cta: 'See the Engineering room',
    motif: <EngineeringMotif />,
  },
  {
    heading: 'For marketers.',
    body: [
      'Outreach drafted the moment a lead enters your CRM.',
      'KB articles published when a ticket resolves.',
      'Morning updates sent without a single keystroke.',
    ],
    integrations: ['HubSpot', 'Mailchimp', 'Mixpanel', 'Intercom', 'Notion'],
    agents: ['Outreach Drafter', 'Campaign Planner', 'KB Writer', 'Status Reporter'],
    href: '/use-cases/for-marketers',
    cta: 'See the Marketing room',
    motif: <MarketingMotif />,
  },
];

export default function UseCasesPage() {
  return (
    <main className="pb-0">
      <div className="mx-auto max-w-5xl px-6 pt-44 pb-24 sm:pt-52">
        <FadeIn>
          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Use Cases</p>
        </FadeIn>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          <FadeIn as="span" delay={60} className="block">
            One platform.
          </FadeIn>
          <FadeIn as="span" delay={120} className="block text-(--color-fg-muted)">
            Every team.
          </FadeIn>
        </h1>
        <FadeIn delay={200}>
          <p className="mt-6 max-w-xl text-lg text-(--color-fg-muted) leading-relaxed">
            Your whole org, on autopilot. Each team gets a dedicated room of agents working toward the goals you set, around the clock.
          </p>
        </FadeIn>
      </div>

      <div className="pb-24 sm:pb-32">
        {sections.map((s) => (
          <section key={s.heading} className="bg-(--color-bg)">
            <div className="mx-auto max-w-5xl px-6 py-5 sm:py-6">
              <SectionReveal>
                <ChainItem delay={0} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg) p-8 sm:p-12">
                  <ChainItem as="h2" delay={80} className="text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl mb-10 sm:mb-12">
                    {s.heading}
                  </ChainItem>

                  <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[280px_1fr] lg:gap-16">
                    <ChainItem delay={160} className="w-full max-w-[280px] mx-auto lg:mx-0">
                      {s.motif}
                    </ChainItem>

                    <div>
                      <ChainItem delay={240}>
                        <ul className="space-y-3">
                          {s.body.map((line) => (
                            <li key={line} className="flex items-start gap-3 text-lg text-(--color-fg-muted) leading-relaxed">
                              <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-(--color-fg-subtle)" />
                              {line}
                            </li>
                          ))}
                        </ul>
                      </ChainItem>

                      <ChainItem delay={320} className="mt-6 flex justify-start">
                        <Link
                          href={s.href}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg) transition-colors underline underline-offset-4"
                        >
                          {s.cta}
                          <Icon name="arrow-right" className="h-4 w-4" />
                        </Link>
                      </ChainItem>

                      <ChainItem delay={400}>
                        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 border-t border-(--color-border) pt-8 sm:grid-cols-[auto_1fr] sm:gap-x-10">
                          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase sm:pt-2">The crew</p>
                          <div className="flex flex-wrap gap-2">
                            {s.agents.map((a) => (
                              <span
                                key={a}
                                className="inline-flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-1.5 text-xs font-medium text-(--color-fg-muted)"
                              >
                                <Icon name={agentIcon[a]} className="h-4 w-4 shrink-0 text-(--color-fg-subtle)" />
                                {a}
                              </span>
                            ))}
                          </div>

                          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase sm:pt-1">Works with</p>
                          <div className="flex flex-wrap items-center gap-5">
                            {s.integrations.map((name) => (
                              <img
                                key={name}
                                src={`/integrations/${integrationSlug[name]}.svg`}
                                alt={name}
                                title={name}
                                className="h-6 w-6 shrink-0 brightness-0 invert opacity-40 transition-opacity hover:opacity-70"
                              />
                            ))}
                          </div>
                        </div>
                      </ChainItem>
                    </div>
                  </div>
                </ChainItem>
              </SectionReveal>
            </div>
          </section>
        ))}
      </div>

      <Footer />
    </main>
  );
}
