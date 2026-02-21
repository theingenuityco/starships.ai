import Link from 'next/link'
import type { Metadata } from 'next'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import StarryBackground from '@/app/components/StarryBackground'
import { StarTheme } from '@/components/theme-context'
import { USE_CASES } from '@/app/use-cases/use-cases.data'

export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export const metadata: Metadata = {
  title: 'Use cases | Starships.ai',
  description: 'Real-world ways to use Starships.ai: lead generation, building a WordPress site, and more.',
  alternates: {
    canonical: 'https://starships.ai/use-cases',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Use cases | Starships.ai',
    description: 'Real-world ways to use Starships.ai: lead generation, building a WordPress site, and more.',
    url: 'https://starships.ai/use-cases',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai use cases',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use cases | Starships.ai',
    description: 'Real-world ways to use Starships.ai: lead generation, building a WordPress site, and more.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function UseCasesIndexPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-background relative">
        <StarryBackground />
        {/* Bottom glow for the whole page (decorative background, never above content) */}
        <div
          className="absolute inset-x-0 bottom-0 h-[120vh] pointer-events-none z-[1]"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse 1000px 700px at 50% 100%, rgba(168,85,247,0.55), transparent 65%)',
              'radial-gradient(ellipse 1200px 850px at 50% 102%, rgba(139,92,246,0.42), transparent 70%)',
              'radial-gradient(ellipse 1400px 1000px at 50% 105%, rgba(99,102,241,0.32), transparent 75%)',
            ].join(', '),
          }}
          aria-hidden
        />

        <div className="relative z-10">
          <PublicHeader />

          <main className="pb-12 sm:pb-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16">
              <div className="text-center">
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">Use cases</h1>
                <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
                  Practical, repeatable workflows you can run with agents—start here, then tailor to your tools and team.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {USE_CASES.map(card => (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="group rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold tracking-tight text-foreground">{card.title}</div>
                        <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{card.cardDescription}</div>
                      </div>
                      {card.tag ? (
                        <span className="shrink-0 inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                          {card.tag}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 text-sm text-primary group-hover:underline underline-offset-2">Read use case</div>
                  </Link>
                ))}
              </div>

              <div className="mt-12 rounded-xl border border-border/60 bg-card/70 p-6">
                <div className="text-sm font-semibold text-foreground">Want templates instead?</div>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-[80ch]">
                  Explore agents, automations, and connectors you can install in minutes—then adapt them to your use case.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link href="/explore" className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-10 px-5 text-sm font-semibold hover:opacity-95 transition-opacity">
                    Explore templates
                  </Link>
                  <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/50 h-10 px-5 text-sm font-semibold text-foreground hover:bg-accent transition-colors">
                    Get started
                  </Link>
                </div>
              </div>
            </div>
          </main>

          <PublicFooter fromPath="/use-cases" />
        </div>
      </div>
    </StarTheme>
  )
}

