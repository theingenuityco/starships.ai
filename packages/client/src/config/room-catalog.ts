export type RoomCatalogEntry = {
  bundleId: string
  name: string
  description: string
  icon: string
  features: string[]
  previewImage?: string
  comingSoon?: boolean
  ensureEndpoint: string
}

export const ROOM_CATALOG: RoomCatalogEntry[] = [
  {
    bundleId: 'lead-generation',
    name: 'Lead Generation',
    description: 'Find, qualify, and engage your ideal target accounts using AI-powered research and outreach.',
    icon: '🎯',
    features: ['ICP Profiles', 'Accounts dataset', '5 AI agents'],
    previewImage: '/landing/showcase/lead-generation.png',
    ensureEndpoint: 'ensure-leadgen-room',
  },
  {
    bundleId: 'engineering',
    name: 'Engineering',
    description: 'Triage your backlog, build and test changes on a real checkout, and open reviewed pull requests.',
    icon: '🛠️',
    features: ['Repos dataset', 'GitHub PRs', '5 AI agents'],
    ensureEndpoint: 'ensure-engineering-room',
  },
  {
    bundleId: 'outreach',
    name: 'Outreach',
    description: 'Run personalised email and LinkedIn sequences at scale with AI-written copy and automated follow-ups.',
    icon: '✉️',
    features: ['Sequence builder', 'Email templates', 'Reply tracking'],
    comingSoon: true,
    ensureEndpoint: 'ensure-outreach-room',
  },
  {
    bundleId: 'partnerships',
    name: 'Partnerships',
    description: 'Manage co-sell motions, alliance pipelines, and partner-sourced deals in one collaborative space.',
    icon: '🤝',
    features: ['Partner registry', 'Co-sell pipeline', 'Deal tracking'],
    comingSoon: true,
    ensureEndpoint: 'ensure-partnerships-room',
  },
  {
    bundleId: 'customer-success',
    name: 'Customer Success',
    description: 'Monitor health scores, automate onboarding, and surface expansion opportunities across your book of business.',
    icon: '💚',
    features: ['Health scores', 'Onboarding tracker', 'Renewal alerts'],
    comingSoon: true,
    ensureEndpoint: 'ensure-customer-success-room',
  },
  {
    bundleId: 'market-intelligence',
    name: 'Market Intelligence',
    description: 'Track competitors, monitor industry signals, and turn market noise into actionable briefs for your team.',
    icon: '🔭',
    features: ['Competitor tracking', 'Signal monitoring', 'Auto-briefs'],
    comingSoon: true,
    ensureEndpoint: 'ensure-market-intelligence-room',
  },
]
