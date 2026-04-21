import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/primitives/Icon'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'
import {
  landingPrimaryCtaSection,
  landingSecondaryCta,
  panelLight,
  panelLightLift,
} from '@/app/components/landing/landingSurface'
import { cn } from '@/lib/utils'

export function UseCaseHero(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  return (
    <section className="mt-6 sm:mt-8">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Link href="/use-cases" className="transition-colors hover:text-slate-900">
          Use cases
        </Link>
        <span className="opacity-60">/</span>
        <span className="text-slate-800">{useCase.title}</span>
      </div>

      <div className={cn('relative mt-6 overflow-hidden p-7 sm:p-9', panelLight, panelLightLift)}>
        <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {useCase.tag ? (
                <Badge variant="connected" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                  {useCase.tag}
                </Badge>
              ) : null}
              <Badge variant="outline" className="rounded-full border-slate-300 bg-white text-slate-600">
                Playbook
              </Badge>
            </div>

            <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl text-slate-900">{useCase.title}</h1>
            <p className="mt-4 max-w-2xl text-balance text-sm text-slate-600 sm:text-base">{useCase.heroSubtitle}</p>

            {useCase.heroPrompt ? <UseCaseHeroPromptInput className="mt-6" placeholder={useCase.heroPrompt.placeholder} examples={useCase.heroPrompt.examples} /> : null}

            <div className="mt-6 grid max-w-3xl grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(useCase.outputs ?? []).slice(0, 4).map((o, idx) => (
                <div key={`${useCase.slug}-hero-out-${idx}`} className="flex items-start gap-2 text-sm text-slate-600">
                  <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span className="leading-relaxed">{o}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-[18rem]">
            <Link href="/explore" className={cn(landingPrimaryCtaSection, 'inline-flex items-center justify-center gap-2')}>
              <Icon name="sparkles" className="h-4 w-4" />
              Explore templates
            </Link>
            <Link href="/login" className={cn(landingSecondaryCta, 'inline-flex h-11 items-center justify-center px-6 text-sm')}>
              Get started
            </Link>
            <div className="pt-2 text-xs text-slate-600">Tip: start with templates, then adapt the playbook to your exact tools and tone.</div>
          </div>
        </div>
      </div>
    </section>
  )
}
