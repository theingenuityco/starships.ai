/**
 * Shared prompt cards for the lead-generation use case.
 * Used on the use-case landing page and in the leadgen room starter suggestions.
 */
export const LEAD_GEN_PROMPT_CARDS = [
  {
    title: 'Find ideal leads',
    description: 'Find me 50 leads of professional photographers in London, with their website, LinkedIn, and work email.',
  },
  {
    title: 'Get decision makers',
    description: 'For each company in this sheet, list 1–2 likely decision makers with their role and LinkedIn profile.',
  },
  {
    title: 'Enrich my list',
    description: 'Enrich this CSV of companies with 1–2 decision makers per company, including role, LinkedIn, and verified work email.',
  },
  {
    title: 'Write first-touch emails',
    description: 'Write a short, friendly cold email for each contact that references one specific detail from their site or LinkedIn.',
  },
  {
    title: 'Score the leads',
    description: 'Score each lead as A/B/C based on fit and timing, and add one sentence on why you gave that score.',
  },
] as const
