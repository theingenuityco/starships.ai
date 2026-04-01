'use client'

import type { ComparisonContent } from '@/app/compare/comparison-content'

export default function MigrationSteps(props: { content: ComparisonContent }) {
  const { content } = props

  return (
    <section id="migration" className="bg-white px-4 py-14 text-slate-900 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
          <span className="text-primary">Migrate</span> from Motion in four steps
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">{content.migration.subtitle}</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {content.migration.steps.map((step, idx) => (
            <article
              key={step.title}
              className="rounded-none border border-slate-200 bg-[#F8F8FA] p-6 shadow-[3px_3px_0_0_rgb(226_232_240)]"
            >
              <div className="mb-4 h-[2px] w-14 bg-primary" aria-hidden />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/90">Step {idx + 1}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
