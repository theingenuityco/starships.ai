import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { PromptEditorBlock } from './PromptCardWithCopy'

const FALLBACK_PROSPECTING_CARDS = [
  { title: 'Build Lead Lists', description: 'Create lead lists that match your target audience. Spot companies that look like your best customers and are active right now.' },
  { title: 'Find Contact Info', description: 'Pull direct contact details for key decision-makers so you can reach the right people without hours of manual research.' },
  { title: 'Personalize Your Outreach', description: 'Draft short, specific messages that reference recent activity, website copy, or product changes—no generic spray-and-pray.' },
  { title: 'Meeting Prep', description: 'Walk into every call with context: company summary, key initiatives, recent news, and likely pain points in one place.' },
  { title: 'Recruiting', description: 'Source candidates who match your ideal profile, then personalize outreach and follow-up so hiring pipelines stay warm.' },
]

export function UseCaseSections(props: { useCase: UseCaseModel; previewPrompts?: string[] }) {
  const { useCase, previewPrompts = [] } = props

  const isLeadGeneration = useCase.slug === 'lead-generation'

  const contentCards =
    isLeadGeneration && previewPrompts.length > 0
      ? previewPrompts.map((prompt, idx) => ({
          title:
            useCase.previewPromptTitles?.[idx] ??
            prompt
              .slice(0, 50)
              .trim()
              .replace(/\s+\S*$/, '') + '…',
          description: prompt,
        }))
      : isLeadGeneration
        ? FALLBACK_PROSPECTING_CARDS
        : []

  const leadGenerationProspectingCards =
    contentCards.length > 0
      ? [
          ...contentCards,
          {
            title: 'See more prompts',
            description: 'Explore additional workflows and prompt ideas you can adapt for your own segments, offers, and channels.',
          },
        ]
      : []

  return (
    <>
      {isLeadGeneration ? (
        <section className="mt-8 sm:mt-10 bg-white dark:bg-slate-950" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{useCase.workflowsSectionHeading ?? 'Lead generation workflows'}</h2>
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
                        ? 'rounded-3xl border border-amber-500 bg-amber-500 dark:bg-amber-400 text-amber-950 dark:text-slate-950 shadow-sm transition-colors h-full'
                        : 'rounded-2xl border-0 bg-[#F7F7F2] dark:bg-slate-900/40 shadow-sm transition-colors h-full'
                    }
                  >
                    <div className={isHighlight ? 'p-6 sm:p-8 flex flex-col h-full items-center justify-center text-center' : 'p-6 sm:p-8 flex flex-col h-full text-left'}>
                      {isHighlight ? (
                        <>
                          <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">Explore more capabilities</h3>

                          <div className="mt-6">
                            <Button
                              asChild
                              size="sm"
                              className="relative inline-flex items-center justify-center h-10 px-6 rounded-full text-sm font-semibold whitespace-nowrap text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] hover:shadow-[0_2px_0_0_rgba(15,23,42,0.22)] hover:-translate-y-[1px] active:shadow-[0_0px_0_0_rgba(15,23,42,0.22)] active:translate-y-[1px] transition"
                            >
                              <Link href={useCase.primaryTemplateSlug ? `/explore/agents/${useCase.primaryTemplateSlug}` : '/explore/agents'}>
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
          </div>
        </section>
      ) : null}

      {isLeadGeneration && useCase.videoEmbedUrl ? (
        <section className="mt-20">
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
                  className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-white bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:shadow-[0_2px_0_0_rgba(180,83,9,1)] hover:-translate-y-[1px] active:shadow-[0_0px_0_0_rgba(180,83,9,1)] active:translate-y-[1px] transition gap-2"
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

      <section className="mt-20 bg-white dark:bg-slate-950" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">The workflow</h2>
            <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-[70ch]">Agents research and draft. Automations schedule and enrich. Simple and consistent.</p>
          </div>

          <div className="mt-6">
            <Card className="rounded-2xl border-0 bg-[#F7F7F2] dark:bg-slate-900/40 shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold tracking-tight text-foreground">Workflow</div>
                  <div className="text-xs text-muted-foreground">{useCase.steps.length} steps</div>
                </div>

                <ol className="mt-4 relative pl-6">
                <div
                  className="pointer-events-none absolute left-[11px] top-0 bottom-0 w-px"
                  style={{
                    backgroundImage: 'linear-gradient(to bottom, rgba(168,85,247,0.55), rgba(59,130,246,0.45), rgba(245,158,11,0.35))',
                  }}
                  aria-hidden
                />
                {useCase.steps.map((s, idx) => (
                  <li
                    key={`${useCase.slug}-step-${idx}`}
                    className="relative pb-3 last:pb-0 animate-workflow-step"
                    style={{ animationDelay: `${idx * 0.12}s` }}
                  >
                    <div className="absolute left-0 top-0 h-6 w-6 rounded-full bg-white dark:bg-slate-900 ring-1 ring-emerald-400/30 flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-foreground tabular-nums">{idx + 1}</span>
                    </div>
                    <div className="ml-6 flex gap-2.5 rounded-lg border border-border/60 border-l-2 border-l-emerald-400/40 bg-white dark:bg-slate-900 px-3 py-2.5">
                      <Icon name="check-circle" className="h-4 w-4 text-emerald-500/80 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">{s.title}</div>
                        <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
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
                      className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_4px_0_0_rgba(15,23,42,0.18)] hover:shadow-[0_2px_0_0_rgba(15,23,42,0.22)] hover:-translate-y-[1px] active:shadow-[0_0px_0_0_rgba(15,23,42,0.22)] active:translate-y-[1px] transition border-0"
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
    </>
  )
}
