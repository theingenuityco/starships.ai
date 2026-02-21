export type UseCaseSlug = 'lead-generation' | 'wordpress-site'

export type UseCaseStep = {
  title: string
  description: string
}

export type UseCaseLink = {
  href: string
  label: string
}

export type UseCaseSeo = {
  title: string
  description: string
  canonicalPath: `/use-cases/${UseCaseSlug}` | '/use-cases'
  ogAlt: string
}

export type UseCaseModel = {
  slug: UseCaseSlug
  href: `/use-cases/${UseCaseSlug}`
  title: string
  cardDescription: string
  tag?: string
  heroSubtitle: string
  tip?: string
  outputs: string[]
  steps: UseCaseStep[]
  examplePrompts: string[]
  nextTitle: string
  nextDescription: string
  nextLinks: UseCaseLink[]
  seo: UseCaseSeo
}

export const USE_CASES: UseCaseModel[] = [
  {
    slug: 'lead-generation',
    href: '/use-cases/lead-generation',
    title: 'Lead generation',
    cardDescription: 'Source prospects, personalize outreach, and keep your pipeline warm with agents + automations.',
    tag: 'Growth',
    heroSubtitle: 'A practical workflow to research prospects, personalize outreach, and keep a clean pipeline—without living in spreadsheets.',
    tip: 'Start narrow: one vertical + one role + one offer. Expand only after you see replies.',
    outputs: ['Prospect list with signals + fit score', 'Personalized first-touch messages', 'Follow-up sequences + reminders', 'Weekly learnings + next experiments'],
    steps: [
      { title: 'Target + source', description: 'Define your ICP, pick sources (directories, LinkedIn, job boards), and generate a structured prospect list.' },
      { title: 'Enrich + qualify', description: 'Add firmographic signals, validate contact details, and score prospects so the team focuses on best-fit leads.' },
      { title: 'Personalize outreach', description: 'Generate short, specific messages tied to each prospect’s context—no generic spray-and-pray.' },
      { title: 'Follow up automatically', description: 'Schedule sequences and reminders, then hand off replies to a human (or a specialist agent) when needed.' },
      { title: 'Track + improve', description: 'Summarize learnings weekly: which segments respond, which angles work, and what to test next.' },
    ],
    examplePrompts: [
      'Build a list of 50 SaaS startups (10–50 employees) hiring for RevOps, with website + LinkedIn + 1 sentence “why now”.',
      'For each company, draft a 90-word cold email referencing one specific thing they ship and a likely bottleneck.',
      'Turn these notes into a 5-touch follow-up sequence (email + LinkedIn), with a gentle CTA for a 15-minute chat.',
      'Given our ICP and offer, propose 3 lead magnets and outline the landing page copy for each.',
    ],
    nextTitle: 'Next: install starting points',
    nextDescription:
      'Use Explore to install agents/automations you can adapt for sourcing, enrichment, outreach, and follow-up. Then wire them into a repeatable sequence.',
    nextLinks: [
      { href: '/explore/agents', label: 'Browse agents' },
      { href: '/explore/automations', label: 'Browse automations' },
      { href: '/explore/connectors', label: 'Browse connectors' },
    ],
    seo: {
      title: 'Lead generation | Use cases | Starships.ai',
      description: 'A practical lead generation workflow: research, personalize outreach, follow up, and keep a clean pipeline with agents + automations.',
      canonicalPath: '/use-cases/lead-generation',
      ogAlt: 'Lead generation use case',
    },
  },
  {
    slug: 'wordpress-site',
    href: '/use-cases/wordpress-site',
    title: 'WordPress site',
    cardDescription: 'Plan, write, and ship a WordPress site (pages, copy, SEO, and a launch checklist) with a repeatable workflow.',
    tag: 'Web',
    heroSubtitle: 'A repeatable workflow to plan, write, and ship a WordPress site—fast, consistent, and ready to launch.',
    tip: 'Keep each page to one job. If a page has multiple CTAs, you’ll likely lose conversion.',
    outputs: ['Site map + page goals', 'Draft copy for each page section', 'SEO titles/descriptions + headings', 'Launch checklist + post-launch plan'],
    steps: [
      { title: 'Plan structure', description: 'Define pages, navigation, and goals per page. Keep it simple and focused on one primary CTA.' },
      { title: 'Write draft copy', description: 'Generate first-pass copy for each section, then revise for clarity, proof, and brand voice.' },
      { title: 'Produce assets', description: 'Create image briefs, icon lists, and content requirements so design/dev can execute quickly.' },
      { title: 'SEO + polish', description: 'Add metadata, headings, internal links, and a basic keyword map. Ensure readability and scannability.' },
      { title: 'Launch checklist', description: 'Performance, accessibility, analytics, forms, and a post-launch monitoring plan—done before you ship.' },
    ],
    examplePrompts: [
      'Draft an information architecture for a 5-page marketing site for a {business}, with page goals and primary CTA for each page.',
      'Write the homepage hero, 3 benefit sections, social proof section, and a final CTA—keep it concise and avoid hype.',
      'Generate SEO meta title + meta description + H1/H2 outline for each page, and suggest internal links between pages.',
      'Create a launch checklist: performance, accessibility, analytics, tracking, forms, backups, and post-launch monitoring.',
    ],
    nextTitle: 'Next: ship the site',
    nextDescription: 'Install a writing or website workflow template, tailor it to your brand voice, and reuse it every time you launch a new page.',
    nextLinks: [
      { href: '/explore/agents', label: 'Browse agents' },
      { href: '/explore/automations', label: 'Browse automations' },
    ],
    seo: {
      title: 'WordPress site | Use cases | Starships.ai',
      description: 'A practical workflow to plan, write, and ship a WordPress site: pages, copy, SEO, and a launch checklist.',
      canonicalPath: '/use-cases/wordpress-site',
      ogAlt: 'WordPress site use case',
    },
  },
] as const

export const USE_CASES_BY_SLUG: Record<UseCaseSlug, UseCaseModel> = USE_CASES.reduce(
  (acc, uc) => {
    acc[uc.slug] = uc
    return acc
  },
  {} as Record<UseCaseSlug, UseCaseModel>
)

export function getUseCaseBySlug(slug: string): UseCaseModel | null {
  const s = String(slug || '').trim().toLowerCase() as UseCaseSlug
  return (USE_CASES_BY_SLUG as any)[s] ?? null
}

