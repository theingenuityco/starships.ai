import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import Icon from '@/components/primitives/Icon'
import StarryBackground from '@/app/components/StarryBackground'
import { landingPrimaryWhiteFaceCtaSection } from '@/app/components/landing/landingSurface'
import { cn } from '@/lib/utils'

export function WordPressSiteHero(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  return (
    <section
      className="relative flex min-h-[100vh] flex-col justify-center overflow-hidden pb-[min(28vh,12rem)] pt-20 text-white sm:pb-24 sm:pt-24"
      style={{ backgroundColor: '#050b24' }}
    >
      <StarryBackground position="absolute" className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />

<div className="relative z-10 mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="flex items-center gap-2 text-xs text-white/65 sm:text-sm">
          <Link href="/use-cases" className="transition-colors hover:text-white">
            Use cases
          </Link>
          <span className="opacity-60">/</span>
          <span className="text-white/90">{useCase.title}</span>
        </div>

        <div className="mt-6 flex flex-col gap-8 lg:mt-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="min-w-0 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              {useCase.tag ? (
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/95">{useCase.tag}</span>
              ) : null}
              <span className="rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80">Playbook</span>
            </div>

            <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">{useCase.title}</h1>
            <p className="mt-4 text-pretty text-base text-white/80 sm:text-lg">{useCase.heroSubtitle}</p>

            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:mt-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-2.5">
              {useCase.outputs.map((line, idx) => (
                <li key={`${useCase.slug}-out-${idx}`} className="flex items-start gap-2.5 text-left text-sm text-white/85 sm:text-[15px]">
                  <Icon name="check-circle" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" weight="fill" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 border-t border-white/10 pt-8 lg:w-[17.5rem] lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <Link
              href="/explore"
              className={cn(landingPrimaryWhiteFaceCtaSection, 'relative z-10 inline-flex w-full justify-center gap-2')}
            >
              <Icon name="sparkles" className="h-4 w-4" />
              Explore templates
            </Link>
            {useCase.tip ? <p className="pt-1 text-xs leading-relaxed text-white/55">{useCase.tip}</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
