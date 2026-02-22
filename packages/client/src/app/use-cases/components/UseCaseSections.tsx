import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'

export function UseCaseSections(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  return (
    <>
      <section className="mt-12">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">How this playbook runs</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-[70ch]">
              Use agents to draft, research, and summarize; use automations to schedule, enrich, and keep the workflow consistent.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full bg-background/40 border-border/60 text-muted-foreground">
            Reusable workflow
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2">
            <Card className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm overflow-hidden">
              <div className="p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold tracking-tight text-foreground">Workflow</div>
                  <div className="text-xs text-muted-foreground">{useCase.steps.length} steps</div>
                </div>

                <ol className="mt-5 relative pl-6">
                  <div
                    className="pointer-events-none absolute left-[11px] top-0 bottom-0 w-px"
                    style={{
                      backgroundImage: 'linear-gradient(to bottom, rgba(168,85,247,0.55), rgba(59,130,246,0.45), rgba(245,158,11,0.35))',
                    }}
                    aria-hidden
                  />
                  {useCase.steps.map((s, idx) => (
                    <li key={`${useCase.slug}-step-${idx}`} className="relative pb-5 last:pb-0">
                      <div className="absolute left-0 top-0 h-6 w-6 rounded-full bg-background/70 ring-1 ring-border/60 flex items-center justify-center">
                        <span className="text-[11px] font-semibold text-foreground tabular-nums">{idx + 1}</span>
                      </div>
                      <div className="ml-6 rounded-xl border border-border/60 bg-background/35 p-4">
                        <div className="text-sm font-semibold text-foreground">{s.title}</div>
                        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          </section>

          <aside>
            <Card className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm">
              <div className="p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold tracking-tight text-foreground">Outputs</div>
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-4 space-y-2.5">
                  {useCase.outputs.map((o, idx) => (
                    <div key={`${useCase.slug}-out-${idx}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-emerald-400" />
                      <span className="leading-relaxed">{o}</span>
                    </div>
                  ))}
                </div>

                {useCase.tip ? (
                  <div className="mt-7 rounded-xl border border-border/60 bg-background/35 p-4">
                    <div className="text-xs font-semibold text-muted-foreground">Tip</div>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{useCase.tip}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          </aside>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Example prompts</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-[70ch]">Copy these as a starting point, then tweak inputs for your segment, offer, and tone.</p>
          </div>
          <Badge variant="outline" className="rounded-full bg-background/40 border-border/60 text-muted-foreground">
            {useCase.examplePrompts.length} prompts
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {useCase.examplePrompts.map((p, idx) => (
            <div key={`${useCase.slug}-prompt-${idx}`} className="relative group">
              <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500/45 via-fuchsia-500/45 to-amber-500/35 opacity-10 blur-md transition-opacity duration-500 group-hover:opacity-35" />
              <Card className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-muted-foreground">Prompt {idx + 1}</div>
                    <Icon name="sparkles" className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-3 text-sm text-foreground leading-relaxed font-medium">{p}</p>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="relative group">
          <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-25 blur-md transition-opacity duration-500 group-hover:opacity-60" />
          <Card className="relative overflow-hidden rounded-2xl border-0 shadow-lg bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/15 to-amber-500/15">
            <div className="p-7 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Next step</div>
                <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-foreground">{useCase.nextTitle}</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-[90ch]">{useCase.nextDescription}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {useCase.nextLinks.map(l => (
                  <Button key={l.href} asChild size="lg" variant="outline" className="h-11 px-6 rounded-full bg-background/40">
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
      </section>
    </>
  )
}

