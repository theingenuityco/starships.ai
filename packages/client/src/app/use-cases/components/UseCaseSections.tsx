import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { PromptEditorBlock } from './PromptCardWithCopy'

const LEAD_GEN_PROMPT_CARDS = [
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
]

export function UseCaseSections(props: { useCase: UseCaseModel }) {
  const { useCase } = props

  const isLeadGeneration = useCase.slug === 'lead-generation'

  const leadGenerationProspectingCards =
    isLeadGeneration
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
      <section className="mt-0 bg-white dark:bg-slate-950" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-0 pb-16 sm:pb-20">
          <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-foreground">
              The <span className="text-primary">Workflow</span>
            </h2>
            <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-[70ch]">Agents research and draft. Automations schedule and enrich. Simple and consistent.</p>
          </div>

          <div className="mt-6">
            <Card className="rounded-2xl border border-border/80 bg-[#FAFAF8] dark:bg-slate-900/60 shadow-md overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="text-sm font-semibold tracking-tight text-foreground">How it works</div>

                <ol className="mt-4 relative pl-6">
                  <div className="pointer-events-none absolute left-[11px] top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600" aria-hidden />
                  {useCase.steps.map((s, idx) => (
                    <li key={`${useCase.slug}-step-${idx}`} className="relative pb-4 last:pb-0 animate-workflow-step" style={{ animationDelay: `${idx * 0.12}s` }}>
                      <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-white dark:bg-slate-800 border-2 border-emerald-500 flex items-center justify-center">
                        <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{idx + 1}</span>
                      </div>
                      <div className="ml-10 flex gap-3 rounded-xl border border-border/70 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-800/80 px-4 py-3.5 shadow-sm">
                        <Icon name="check-circle" className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" weight="fill" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{s.title}</div>
                          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>

                {useCase.tip ? (
                  <div className="mt-5 rounded-lg border border-border/60 bg-white dark:bg-slate-900 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Icon name="lightbulb" className="h-4 w-4 text-amber-500 shrink-0" />
                      Tip
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{useCase.tip}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          {!isLeadGeneration ? (
            <div className="mt-12 relative group">
              <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-90 blur-md transition-opacity duration-500 group-hover:opacity-100" />
              <Card className="relative overflow-hidden rounded-2xl border-0 shadow-lg bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500">
                <div className="p-7 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-white">
                  <div>
                    <div className="text-xs font-semibold text-white/90">Next step</div>
                    <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-white">{useCase.nextTitle}</h2>
                    <p className="mt-2 text-base sm:text-lg text-white/90 max-w-[90ch]">{useCase.nextDescription}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {useCase.nextLinks.map(l => (
                      <Button
                        key={l.href}
                        asChild
                        size="lg"
                        variant="outline"
                        className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(15,23,42,0.22)] active:-translate-y-[1px] transition border-0"
                      >
                        <Link href={l.href}>
                          {l.label}
                          <Icon name="chevron-right" className="h-4 w-4" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </section>

      {isLeadGeneration && useCase.videoEmbedUrl ? (
        <section className="my-10 sm:my-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="order-2 lg:order-1">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-foreground">
                See how it
                <br />
                <span className="text-primary">works</span>
              </h2>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-[42ch]">
                Watch a quick walkthrough of Piper in action—from writing your first prompt to getting qualified leads. No setup required.
              </p>
              <div className="mt-6">
                <Button
                  asChild
                  size="lg"
                  className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-white bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition gap-2"
                >
                  <Link href="/login">
                    Sign up free
                    <Icon name="chevron-right" className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-border/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 shadow-lg">
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
        <section className="mt-20 bg-white dark:bg-slate-950" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-foreground">
                {useCase.workflowsSectionHeading === 'Try it yourself' ? (
                  <>
                    <span className="text-primary">Try it</span> yourself
                  </>
                ) : (
                  (useCase.workflowsSectionHeading ?? 'Lead generation workflows')
                )}
              </h2>
              <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-[70ch]">
                {useCase.workflowsSectionSubheading ??
                  'Simple workflows from first touch to booked meeting. Use agents to discover, enrich, personalize, and follow up—without living in spreadsheets.'}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {leadGenerationProspectingCards.map(card => {
                const isHighlight = card.title === 'See more prompts'

                return (
                  <Card
                    key={card.title}
                    className={
                      isHighlight
                        ? 'rounded-3xl border border-amber-500 bg-amber-500 dark:bg-amber-400 text-amber-950 dark:text-slate-950 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] transition-colors h-full'
                        : 'rounded-2xl border-0 bg-[#F7F7F2] dark:bg-slate-900/40 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] transition-colors h-full'
                    }
                  >
                    <div className={isHighlight ? 'p-6 sm:p-8 flex flex-col h-full items-center justify-center text-center' : 'p-6 sm:p-8 flex flex-col h-full text-left'}>
                      {isHighlight ? (
                        <>
                          <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">Explore more capabilities</h3>

                          <div className="mt-6">
                            <Button asChild size="sm" className="relative inline-flex items-center justify-center h-10 px-6 rounded-full text-sm font-semibold whitespace-nowrap text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(15,23,42,0.22)] active:-translate-y-[1px] transition">
                              <Link href="/login">
                                Get Started
                                <Icon name="chevron-right" className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-800 dark:text-slate-200 mb-4">{card.title}</h3>
                          <PromptEditorBlock prompt={card.description} className="flex-1 min-h-0" />
                        </>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>

            <div className="mt-20 relative group">
              <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-90 blur-md transition-opacity duration-500 group-hover:opacity-100" />
              <Card className="relative overflow-hidden rounded-2xl border-0 shadow-lg bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500">
                <div className="p-7 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-white">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">{useCase.nextTitle}</h2>
                    <p className="mt-2 text-base sm:text-lg text-white/90 max-w-[90ch]">{useCase.nextDescription}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {useCase.nextLinks.map(l => (
                      <Button
                        key={l.href}
                        asChild
                        size="lg"
                        variant="outline"
                        className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(15,23,42,0.22)] active:-translate-y-[1px] transition border-0"
                      >
                        <Link href={l.href}>
                          {l.label}
                          <Icon name="chevron-right" className="h-4 w-4" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
