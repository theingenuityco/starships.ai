import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'

export function UseCaseSections(props: { useCase: UseCaseModel }) {
  const useCase = props.useCase

  return (
    <>
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-6">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Workflow</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {useCase.steps.map((s, idx) => (
              <div key={`${s.title}-${idx}`} className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">{s.title}</div>
                  <div className="text-[11px] font-semibold text-muted-foreground tabular-nums">Step {idx + 1}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-6">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Outputs you’ll get</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {useCase.outputs.map((o, idx) => (
              <li key={`${idx}-${o}`}>• {o}</li>
            ))}
          </ul>
          {useCase.tip ? (
            <div className="mt-6">
              <div className="text-xs font-semibold text-muted-foreground">Tip</div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{useCase.tip}</p>
            </div>
          ) : null}
        </aside>
      </div>

      <section className="mt-10 rounded-xl border border-border/60 bg-card/70 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Example prompts</h2>
          <span className="text-[11px] font-semibold text-muted-foreground">{useCase.examplePrompts.length} prompts</span>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {useCase.examplePrompts.map((p, idx) => (
            <div key={idx} className="rounded-lg border border-border/60 bg-background/40 p-4">
              <p className="text-sm text-foreground leading-relaxed">{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-border/60 bg-card/70 p-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{useCase.nextTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-[90ch]">{useCase.nextDescription}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {useCase.nextLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/50 h-10 px-5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

