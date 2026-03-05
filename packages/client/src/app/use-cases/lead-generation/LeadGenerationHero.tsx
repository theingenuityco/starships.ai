import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'
import StarryBackground from '@/app/components/StarryBackground'

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
    <section className="relative min-h-[100vh] flex flex-col justify-center overflow-hidden text-white" style={{ backgroundColor: '#020617' }}>
      <StarryBackground position="absolute" className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[42vh] sm:h-[50vh]"
        aria-hidden
        style={{
          backgroundImage: "url('/landing/astro-base.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center bottom',
          backgroundSize: 'cover',
        }}
      />
      <div className="relative z-10 max-w-3xl mx-auto w-full text-center px-4">
        <h1 className="flex justify-center">
          <span className="text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.05] text-balance">
            Lead generation made <span className="text-primary">simple</span>.
          </span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-white/80 text-balance">{useCase.heroSubtitle}</p>

        <div className="mt-8 sm:mt-12 flex justify-center">
          <UseCaseHeroPromptInput className="w-full max-w-3xl" typewriterPrompts={typewriterPrompts} examples={examples} />
        </div>
      </div>
    </section>
  )
}
