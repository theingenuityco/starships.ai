import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { LEAD_GEN_PROMPT_CARDS } from '@/app/use-cases/lead-gen-prompts'
import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import {
  landingPrimaryCtaSection,
  landingWhiteCtaOnGradientMd,
  shellMuted,
  shellMutedLift,
} from '@/app/components/landing/landingSurface'
import { cn } from '@/lib/utils'
import { PromptEditorBlock } from './PromptCardWithCopy'

const creamBg = { backgroundColor: 'hsl(38 30% 97.5%)' } as const

const fullBleed = {
  width: '100vw',
  marginLeft: 'calc(-50vw + 50%)',
  marginRight: 'calc(-50vw + 50%)',
} as const

export function UseCaseSections(props: { useCase: UseCaseModel }) {
  const { useCase } = props

  const isLeadGeneration = useCase.slug === 'lead-generation'

  const leadGenerationProspectingCards = isLeadGeneration
    ? [
        ...LEAD_GEN_PROMPT_CARDS,
        {
          title: 'See more prompts',
          description: 'Explore additional workflows and prompt ideas you can adapt for your own segments, offers, and channels.',
        },
      ]
    : []

  return (
    <>
      <section className="mt-0 bg-white text-slate-900" style={fullBleed}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 pt-0 sm:pb-20">
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl text-slate-900">
              The <span className="text-primary">Workflow</span>
            </h2>
            <p className="mt-2 max-w-[70ch] text-base text-slate-600 sm:text-lg">
              Agents research and draft. Automations schedule and enrich. Simple and consistent.
            </p>
          </div>

          <div className="mt-6">
            <div className={cn('overflow-hidden p-5 sm:p-6', shellMuted, shellMutedLift)}>
              <div className="text-sm font-semibold tracking-tight text-slate-900">How it works</div>

              <ol className="relative mt-4 pl-6">
                <div
                  className="pointer-events-none absolute bottom-0 left-[11px] top-0 w-0.5 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600"
                  aria-hidden
                />
                {useCase.steps.map((s, idx) => (
                  <li
                    key={`${useCase.slug}-step-${idx}`}
                    className="animate-workflow-step relative pb-4 last:pb-0"
                    style={{ animationDelay: `${idx * 0.12}s` }}
                  >
                    <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-none border-2 border-emerald-600 bg-white">
                      <span className="text-xs font-bold tabular-nums text-emerald-700">{idx + 1}</span>
                    </div>
                    <div className="ml-10 flex gap-3 rounded-none border border-slate-200 border-l-4 border-l-emerald-500 bg-white px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
                      <Icon name="check-circle" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" weight="fill" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.description}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              {useCase.tip ? (
                <div className="mt-5 rounded-none border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Icon name="lightbulb" className="h-4 w-4 shrink-0 text-amber-500" />
                    Tip
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{useCase.tip}</p>
                </div>
              ) : null}
            </div>
          </div>

          {!isLeadGeneration ? (
            <div className="group relative mt-12">
              <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
              <Card className="relative flex flex-col items-start justify-between gap-6 overflow-hidden border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 p-7 text-white shadow-lg sm:flex-row sm:items-center sm:p-8">
                <div>
                  <div className="text-xs font-semibold text-white/90">Next step</div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{useCase.nextTitle}</h2>
                  <p className="mt-2 max-w-[90ch] text-base text-white/90 sm:text-lg">{useCase.nextDescription}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {useCase.nextLinks.map(l => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={cn(landingWhiteCtaOnGradientMd, 'inline-flex items-center')}
                    >
                      {l.label}
                      <Icon name="chevron-right" className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </section>

      {isLeadGeneration && useCase.videoEmbedUrl ? (
        <section className="py-10 text-slate-900 sm:py-12" style={{ ...fullBleed, ...creamBg }}>
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">
                See how it
                <br />
                <span className="text-primary">works</span>
              </h2>
              <p className="mt-4 max-w-[42ch] text-base text-slate-600 sm:text-lg">
                Watch a quick walkthrough of Piper in action—from writing your first prompt to getting qualified leads. No setup required.
              </p>
              <div className="mt-6">
                <Link href="/login" className={cn(landingPrimaryCtaSection, 'inline-flex items-center gap-2')}>
                  Sign up free
                  <Icon name="chevron-right" className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-none border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 shadow-[0_6px_20px_rgba(15,23,42,0.12)]">
                <iframe
                  src={useCase.videoEmbedUrl}
                  title="Lead generation demo"
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {isLeadGeneration ? (
        <section className="mt-20 bg-white text-slate-900" style={fullBleed}>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl text-slate-900">
                {useCase.workflowsSectionHeading === 'Try it yourself' ? (
                  <>
                    <span className="text-primary">Try it</span> yourself
                  </>
                ) : (
                  (useCase.workflowsSectionHeading ?? 'Lead generation workflows')
                )}
              </h2>
              <p className="mt-2 max-w-[70ch] text-base text-slate-600 sm:text-lg">
                {useCase.workflowsSectionSubheading ??
                  'Simple workflows from first touch to booked meeting. Use agents to discover, enrich, personalize, and follow up—without living in spreadsheets.'}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {leadGenerationProspectingCards.map(card => {
                const isHighlight = card.title === 'See more prompts'

                if (isHighlight) {
                  return (
                    <div
                      key={card.title}
                      className="flex h-full flex-col items-center justify-center rounded-none border-2 border-amber-400 bg-amber-50 p-6 text-center shadow-[0_6px_20px_rgba(15,23,42,0.08)] sm:p-8"
                    >
                      <h3 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Explore more capabilities</h3>
                      <div className="mt-6">
                        <Link href="/login" className={cn(landingPrimaryCtaSection, 'inline-flex items-center gap-2')}>
                          Get Started Free
                          <Icon name="chevron-right" className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={card.title} className={cn('flex h-full min-h-0 flex-col p-6 sm:p-8', shellMuted, shellMutedLift)}>
                    <h3 className="mb-4 text-base font-bold tracking-tight text-slate-900 sm:text-lg">{card.title}</h3>
                    <PromptEditorBlock prompt={card.description} className="min-h-0 flex-1" />
                  </div>
                )
              })}
            </div>

            <div className="group relative mt-20">
              <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
              <Card className="relative flex flex-col items-start justify-between gap-6 overflow-hidden border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 p-7 text-white shadow-lg sm:flex-row sm:items-center sm:p-8">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{useCase.nextTitle}</h2>
                  <p className="mt-2 max-w-[90ch] text-base text-white/90 sm:text-lg">{useCase.nextDescription}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {useCase.nextLinks.map(l => (
                    <Link key={l.href} href={l.href} className={cn(landingWhiteCtaOnGradientMd, 'inline-flex items-center')}>
                      {l.label}
                      <Icon name="chevron-right" className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
