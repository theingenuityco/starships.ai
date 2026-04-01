import type { FAQItem } from '@/app/components/FAQ'

export type ComparisonRow =
  | {
      type: 'check'
      label: string
      help: string
      starships: boolean
      competitor: boolean
    }
  | {
      type: 'value'
      label: string
      help: string
      starships: string
      competitor: string
    }

export type ComparisonContent = {
  slug: string
  competitorName: string
  seo: {
    title: string
    description: string
    canonicalPath: string
    ogAlt: string
  }
  hero: {
    eyebrow: string
    title: string
    subtitle: string
    primaryCtaLabel: string
    primaryCtaHref: string
    secondaryCtaLabel: string
    secondaryCtaHref: string
  }
  differentiators: Array<{
    title: string
    description: string
    icon: string
  }>
  matrixHeading: {
    title: string
    subtitle: string
  }
  comparisonRows: ComparisonRow[]
  /** Extra product columns to show in the matrix (headers only until row data is added). */
  matrixPlaceholderColumns?: Array<{
    id: string
    name: string
    logoSrc?: string
    logoAlt: string
  }>
  evidenceNote: string
  migration: {
    title: string
    subtitle: string
    steps: Array<{
      title: string
      description: string
    }>
  }
  trust: {
    title: string
    subtitle: string
  }
  researchLinks: Array<{
    label: string
    href: string
  }>
  faqTitle: string
  faqItems: FAQItem[]
  finalCta: {
    title: string
    subtitle: string
    primaryLabel: string
    primaryHref: string
    secondaryLabel: string
    secondaryHref: string
  }
}

const motionComparison: ComparisonContent = {
  slug: 'motion',
  competitorName: 'Motion',
  seo: {
    title: 'Starships vs Motion | Compare AI Workflows',
    description:
      'Compare Starships and Motion across AI delegation, collaboration, integrations, and workflow control to pick the right productivity platform.',
    canonicalPath: '/compare/motion',
    ogAlt: 'Starships vs Motion comparison page',
  },
  hero: {
    eyebrow: 'Comparison',
    title: 'Starships vs Motion',
    subtitle:
      'Motion is strong at personal scheduling. Starships is built for teams that need chat-native execution, specialist AI teammates, and real operational workflows in one place.',
    primaryCtaLabel: 'Get Started Free',
    primaryCtaHref: '/login',
    secondaryCtaLabel: 'See migration steps',
    secondaryCtaHref: '#migration',
  },
  differentiators: [
    {
      title: 'Chat-first execution for cross-functional teams',
      description:
        'Motion is strong at auto-planning calendars and tasks. Starships is better when work needs to be executed in shared team threads with AI teammates.',
      icon: 'users',
    },
    {
      title: 'Specialist AI delegation across workflows',
      description:
        'Run parallel workflows by assigning specialist agents for research, drafting, operations, and follow-up inside the same workspace.',
      icon: 'sparkles',
    },
    {
      title: 'Operational controls before AI actions run',
      description:
        'Use approval gates and run history so teams can safely automate workflows that touch customers, tools, or internal systems.',
      icon: 'shield-check',
    },
    {
      title: 'Faster rollout with reusable agent templates',
      description:
        'Start from marketplace templates, then tailor agents and tool connections to your process instead of building from scratch every time.',
      icon: 'activity',
    },
  ],
  matrixHeading: {
    title: 'Feature comparison',
    subtitle: '',
  },
  comparisonRows: [
    {
      type: 'check',
      label: 'Chat-native team workspace with AI teammates',
      help: 'Work with human teammates and AI in shared conversation threads.',
      starships: true,
      competitor: false,
    },
    { type: 'check', label: 'Specialist AI agents', help: 'Deploy task-specific AI teammates.', starships: true, competitor: false },
    { type: 'check', label: 'Multi-agent delegation', help: 'Delegate one workflow to multiple agents.', starships: true, competitor: false },
    {
      type: 'check',
      label: 'Agent and automation marketplace',
      help: 'Install ready-made agent/tool templates from a public catalog.',
      starships: true,
      competitor: false,
    },
    {
      type: 'check',
      label: 'Approval controls for AI/tool actions',
      help: 'Gate actions with approval policies before execution.',
      starships: true,
      competitor: false,
    },
    {
      type: 'check',
      label: 'Live run history for AI workflows',
      help: 'Track execution and outcomes for automated runs.',
      starships: true,
      competitor: false,
    },
    { type: 'check', label: 'Recurring tasks', help: 'Create daily/weekly/monthly recurring tasks.', starships: true, competitor: true },
    { type: 'check', label: 'Integrations and API', help: 'Connect external tools through integrations and API.', starships: true, competitor: true },
    {
      type: 'value',
      label: 'Collaboration model',
      help: 'Where day-to-day work is coordinated.',
      starships: 'Team chat + AI execution in one workspace',
      competitor: 'Task/project workspace with assignment and comments',
    },
    {
      type: 'value',
      label: 'Primary focus',
      help: 'What each product is optimized for.',
      starships: 'AI teammate delegation and operational execution',
      competitor: 'AI calendar scheduling and task planning',
    },
  ],
  evidenceNote:
    'Note: feature comparison is based on publicly available product pages/docs. If a capability is not clearly documented for Motion, we avoid claiming it.',
  migration: {
    title: 'Migrate from Motion in four steps',
    subtitle: 'Switch without disrupting your current operating rhythm.',
    steps: [
      {
        title: 'Audit your active Motion workflows',
        description: 'List recurring plans, dependencies, and handoffs currently managed in Motion so your migration starts from real usage, not assumptions.',
      },
      {
        title: 'Connect the systems your team executes in',
        description: 'Attach core tools and data sources so Starships can do the work, not just schedule it - including follow-ups and status updates.',
      },
      {
        title: 'Deploy role-based specialist agents',
        description: 'Launch from proven templates, then tune prompts and permissions by function (ops, sales, support, marketing) for reliable outputs.',
      },
      {
        title: 'Run execution from shared team threads',
        description: 'Move approvals, delivery updates, and exceptions into one conversation stream so every stakeholder has full context and clear ownership.',
      },
    ],
  },
  trust: {
    title: 'Built for operators, founders, and execution-heavy teams',
    subtitle: 'Teams choose Starships when they want measurable output, not just a prettier task list.',
  },
  matrixPlaceholderColumns: [
    { id: 'manus', name: 'Manus', logoAlt: 'Manus' },
    { id: 'claude-cowork', name: 'Claude Cowork', logoAlt: 'Claude Cowork' },
    { id: 'openclaw', name: 'OpenClaw', logoAlt: 'OpenClaw' },
  ],
  researchLinks: [
    { label: 'Motion Integrations', href: 'https://www.usemotion.com/features/integrations' },
    { label: 'Motion AI Task Manager', href: 'https://www.usemotion.com/ai-task-manager' },
    { label: 'Motion Help: Integrations', href: 'https://help.usemotion.com/integrations/integrations-in-motion-native-zapier-and-api' },
    { label: 'Motion API: Recurring Tasks', href: 'https://docs.usemotion.com/api-reference/recurring-tasks/post/' },
  ],
  faqTitle: 'Starships vs Motion FAQs',
  faqItems: [
    {
      q: 'Is Starships only for technical teams?',
      a: 'No. Non-technical teams can start with prebuilt templates and guided setup, then progressively customize as needed.',
    },
    {
      q: 'Can Starships replace my planning workflow from Motion?',
      a: 'Yes. You can run planning routines in Starships and then extend into execution by delegating tasks to specialist agents.',
    },
    {
      q: 'Does Starships support recurring workflows?',
      a: 'Yes. You can create scheduled and repeatable runs, then combine them with approvals and collaboration.',
    },
    {
      q: 'What is the biggest difference versus Motion?',
      a: 'Motion is calendar-centric. Starships is execution-centric: team collaboration, AI delegation, integrations, and observable workflow outcomes.',
    },
    {
      q: 'How fast can we migrate?',
      a: 'Most teams can migrate their first recurring workflow in less than a day and expand from there.',
    },
  ],
  finalCta: {
    title: 'Ready to move beyond calendar-only productivity?',
    subtitle: 'Launch your first AI-powered workflow and see execution happen in shared team context.',
    primaryLabel: 'Get Started Free',
    primaryHref: '/login',
    secondaryLabel: 'Contact us',
    secondaryHref: 'mailto:tech@theingenuity.co',
  },
}

export const COMPARISON_CONTENT: Record<string, ComparisonContent> = {
  motion: motionComparison,
}

export function getComparisonContent(slug: string): ComparisonContent | null {
  return COMPARISON_CONTENT[slug] ?? null
}
