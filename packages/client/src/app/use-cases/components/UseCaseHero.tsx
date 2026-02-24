import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { UseCaseHeroPromptInput } from '@/app/use-cases/components/UseCaseHeroPromptInput'

export function UseCaseHero(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  return (
    <section className="mt-6 sm:mt-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/use-cases" className="hover:text-foreground transition-colors">
          Use cases
        </Link>
        <span className="opacity-60">/</span>
        <span className="text-foreground/80">{useCase.title}</span>
      </div>

      <div className="mt-6 relative group">
        <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500/55 via-fuchsia-500/55 to-amber-500/45 opacity-25 blur-md transition-opacity duration-500 group-hover:opacity-55" />
        <Card className="relative overflow-hidden rounded-2xl border-0 bg-card/75 backdrop-blur-md shadow-sm">
          <div
            className="pointer-events-none absolute -top-28 -right-28 h-64 w-64 rounded-full blur-3xl opacity-35"
            style={{
              backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(168,85,247,0.70), transparent 60%)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-28 -left-28 h-64 w-64 rounded-full blur-3xl opacity-25"
            style={{
              backgroundImage: 'radial-gradient(circle at 70% 70%, rgba(59,130,246,0.55), transparent 60%)',
            }}
            aria-hidden
          />

          <div className="p-7 sm:p-9">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-7">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {useCase.tag ? (
                    <Badge variant="connected" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                      {useCase.tag}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="rounded-full bg-background/40 border-border/60 text-muted-foreground">
                    Playbook
                  </Badge>
                </div>

                <h1 className="mt-5 text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05] text-balance">{useCase.title}</h1>
                <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl text-balance">{useCase.heroSubtitle}</p>

                {useCase.heroPrompt ? (
                  <UseCaseHeroPromptInput placeholder={useCase.heroPrompt.placeholder} examples={useCase.heroPrompt.examples} />
                ) : null}

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-3xl">
                  {(useCase.outputs ?? []).slice(0, 4).map((o, idx) => (
                    <div key={`${useCase.slug}-hero-out-${idx}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-emerald-400" />
                      <span className="leading-relaxed">{o}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full lg:w-[18rem]">
                <Button asChild size="lg" className="h-11 rounded-full">
                  <Link href="/explore">
                    <Icon name="sparkles" className="h-4 w-4" />
                    Explore templates
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 rounded-full bg-background/40">
                  <Link href="/login">Get started</Link>
                </Button>
                <div className="pt-2 text-xs text-muted-foreground">
                  Tip: start with templates, then adapt the playbook to your exact tools and tone.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}

