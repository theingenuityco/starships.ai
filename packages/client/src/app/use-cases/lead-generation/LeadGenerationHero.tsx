import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'

export function LeadGenerationHero(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase
  const placeholder = useCase.heroPrompt?.placeholder ?? 'Find finance decision makers…'
  const examples = useCase.heroPrompt?.examples ?? []

  return (
    <section className="pt-10 sm:pt-14 pb-4">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05] text-balance">
          Professional prospecting
          <br />
          for <span className="text-primary">everyone</span>.
        </h1>
        <p className="mt-4 text-sm sm:text-base text-muted-foreground text-balance">
          {useCase.heroSubtitle}
        </p>

        <div className="mt-7 sm:mt-8 flex justify-center">
          <UseCaseHeroPromptInput className="w-full" placeholder={placeholder} examples={examples} />
        </div>
      </div>
    </section>
  )
}

