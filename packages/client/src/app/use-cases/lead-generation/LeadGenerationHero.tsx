import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'

export function LeadGenerationHero(props: { useCase: UseCaseModel; typewriterPrompts?: string[]; previewPromptTitles?: string[] }) {
  const useCase = props.useCase
  const heroExamples = useCase.heroPrompt?.examples ?? []
  const previewPrompts = props.typewriterPrompts ?? []
  const previewPromptTitles = props.previewPromptTitles ?? []

  const typewriterPrompts = previewPrompts.length > 0 ? previewPrompts : heroExamples.map(ex => ex.prompt).filter(Boolean)

  const examples =
    previewPrompts.length > 0
      ? previewPrompts.map((prompt, idx) => ({
          label: previewPromptTitles[idx] ?? `Prompt ${idx + 1}`,
          prompt,
        }))
      : heroExamples

  return (
    <section className="min-h-[95vh] flex flex-col justify-center">
      <div className="max-w-3xl mx-auto w-full text-center px-4">
        <h1 className="flex justify-center">
          <span className="text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.05] whitespace-nowrap">Lead generation made <span className="text-primary">simple</span>.</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-muted-foreground text-balance">{useCase.heroSubtitle}</p>

        <div className="mt-8 sm:mt-12 flex justify-center">
          <UseCaseHeroPromptInput className="w-full" typewriterPrompts={typewriterPrompts} examples={examples} />
        </div>
      </div>
    </section>
  )
}
