import Link from 'next/link'

import type { UseCaseModel } from '@/app/use-cases/use-cases.data'

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

      <h1 className="mt-6 text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">{useCase.title}</h1>
      <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl">{useCase.heroSubtitle}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/explore"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-10 px-5 text-sm font-semibold hover:opacity-95 transition-opacity"
        >
          Explore templates
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/50 h-10 px-5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          Get started
        </Link>
      </div>
    </section>
  )
}

