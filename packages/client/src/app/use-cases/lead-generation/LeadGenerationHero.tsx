import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'
import StarryBackground from '@/app/components/StarryBackground'

export function LeadGenerationHero(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  const examples = [
    {
      label: 'Find ideal leads',
      prompt: 'Find me 50 leads of professional photographers in London, with their website, LinkedIn, and work email.',
    },
    {
      label: 'Get decision makers',
      prompt: 'For each company in this sheet, list 1–2 likely decision makers with their role and LinkedIn profile.',
    },
    {
      label: 'Enrich my list',
      prompt: 'Enrich this CSV of companies with 1–2 decision makers per company, including role, LinkedIn, and verified work email.',
    },
    {
      label: 'Write first-touch emails',
      prompt: 'Write a short, friendly cold email for each contact that references one specific detail from their site or LinkedIn.',
    },
    {
      label: 'Score the leads',
      prompt: 'Score each lead as A/B/C based on fit and timing, and add one sentence on why you gave that score.',
    },
  ]

  const typewriterPrompts = examples.map(ex => ex.prompt)

  return (
    <section className="relative min-h-[100vh] flex flex-col justify-center overflow-hidden text-white" style={{ backgroundColor: '#050b24' }}>
      <StarryBackground position="absolute" className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />
<div className="relative z-10 max-w-5xl mx-auto w-full text-center px-4">
        <h1 className="inline-block font-semibold tracking-tight leading-tight text-3xl sm:text-5xl md:text-7xl text-balance whitespace-normal sm:whitespace-nowrap">
          Lead generation made <span className="text-primary">simple</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-white/80 text-balance max-w-[64ch] mx-auto">{useCase.heroSubtitle}</p>

        <div className="mt-8 sm:mt-12 flex justify-center">
          <UseCaseHeroPromptInput className="w-full max-w-3xl" typewriterPrompts={typewriterPrompts} examples={examples} submitRedirect="login" />
        </div>
      </div>
    </section>
  )
}
