'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import FAQ, { type FAQItem } from '@/app/components/FAQ'
import TestimonialsSection from '@/app/components/TestimonialsSection'
import Security from '@/app/components/Security'
import { landingPrimaryCtaSection, landingPrimaryWhiteFaceCtaSection, landingWhiteCtaOnGradientLg } from '@/app/components/landing/landingSurface'
import Icon from '@/components/primitives/Icon'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { cn } from '@/lib/utils'

type PlanPriceLine = { mode: 'plain'; text: string } | { mode: 'withInterval'; amount: string; intervalTail: string }

function getPlanPriceLine(unitAmount: number | null, currency: string, interval: string | null): PlanPriceLine {
  if (unitAmount === null) return { mode: 'plain', text: 'Custom' }
  if (unitAmount === 0) return { mode: 'plain', text: 'Free' }

  const amount = unitAmount / 100
  const intervalTail = interval === 'month' ? 'mo' : interval === 'year' ? 'yr' : interval ? interval.replace(/^\//, '') : 'mo'

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
    currencyDisplay: 'narrowSymbol',
  }).format(amount)

  return { mode: 'withInterval', amount: formattedAmount, intervalTail }
}

export default function PricingPageClient(): React.JSX.Element {
  const { isAuthenticated } = useAuth()
  const { data: plans = [], isLoading, isError } = useSubscriptionPlans(true, { publicAccess: !isAuthenticated })

  const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
  /** Same flat fill and hard-offset depth as landing `shellMuted` / Security cards. */
  const planCardSurfaceClass = 'border border-slate-200 bg-[#F8F8FA] shadow-[3px_3px_0_0_rgb(226_232_240)]'
  /**
   * Top → bottom wash (inline gradient so opacity reads on `#F8F8FA`; Tailwind-only stops were too faint).
   * Subtle under plan title/price; fades out by ~18% height from the top.
   */
  const planCardGlowStyleByClass: Record<string, CSSProperties> = {
    scout: {
      background: 'linear-gradient(to bottom, rgba(124, 58, 237, 0.28) 0%, rgba(167, 139, 250, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
    },
    frigate: {
      background: 'linear-gradient(to bottom, rgba(217, 119, 6, 0.3) 0%, rgba(251, 191, 36, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
    },
    cruiser: {
      background: 'linear-gradient(to bottom, rgba(124, 58, 237, 0.28) 0%, rgba(167, 139, 250, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
    },
  }

  const sortedPlans = [...plans].sort((a, b) => {
    const ar = shipClassOrder[a.shipClass] ?? 999
    const br = shipClassOrder[b.shipClass] ?? 999
    if (ar !== br) return ar - br
    const au = typeof a.unitAmount === 'number' ? a.unitAmount : Number.MAX_SAFE_INTEGER
    const bu = typeof b.unitAmount === 'number' ? b.unitAmount : Number.MAX_SAFE_INTEGER
    if (au !== bu) return au - bu
    return a.displayName.localeCompare(b.displayName)
  })
  const selfServePlans = sortedPlans.filter(plan => plan.shipClass !== 'scout')
  const tableColumns = [
    ...selfServePlans.map(plan => ({ kind: 'plan' as const, plan })),
    { kind: 'enterprise' as const },
  ]

  const recommendedIndex = 0
  const getPlanColumnStyle = (shipClass: string): CSSProperties => {
    if (shipClass === 'frigate') return { backgroundColor: '#FFF6E8' }
    if (shipClass === 'scout' || shipClass === 'cruiser' || shipClass === 'enterprise') return { backgroundColor: '#FEF6FD' }
    return {}
  }

  type ComparisonRow =
    | {
        type: 'check'
        label: string
        help: string
        includes: (planIndex: number) => boolean
      }
    | {
        type: 'value'
        label: string
        help: string
        getValue: (plan: (typeof sortedPlans)[number]) => string
      }

  const comparisonRows: ComparisonRow[] = [
    {
      type: 'check',
      label: 'AI Chat',
      help: 'Chat-driven execution with your agents and team context.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'AI Agents Marketplace',
      help: 'Discover and deploy ready-made agents and tools from the marketplace.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Integrations',
      help: 'Connect external apps and services so agents can take actions.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Schedule tasks',
      help: 'Create recurring and rule-based automated runs.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'value',
      label: 'AI Credits',
      help: 'Credits included each month for model and automation usage.',
      getValue: plan => `${plan.entitlements.monthlyCredits.toLocaleString()} credits`,
    },
    {
      type: 'value',
      label: 'AI agents',
      help: 'Maximum number of agents supported by the plan.',
      getValue: plan => `${plan.entitlements.maxAgents.toLocaleString()} agents`,
    },
    {
      type: 'value',
      label: 'Parallel task capacity',
      help: 'Maximum concurrent task turns supported by the plan.',
      getValue: plan => `${plan.entitlements.maxConcurrentTurns.toLocaleString()} tasks`,
    },
    {
      type: 'check',
      label: 'Live run history',
      help: 'See execution status and run history in real time.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Approval controls',
      help: 'Choose allow, ask, or deny behavior for tool calls.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Multi-agent delegation',
      help: 'Delegate work across specialist agents in the same flow.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Unlimited Storage',
      help: 'Store unlimited project assets and run data.',
      includes: planIndex => planIndex >= 1,
    },
    {
      type: 'check',
      label: 'Business support',
      help: 'Priority support for business-critical workflows and escalations.',
      includes: planIndex => planIndex >= 1,
    },
    {
      type: 'check',
      label: 'Plan customization',
      help: 'Tailor limits and configuration to your operating needs.',
      includes: planIndex => planIndex >= 2,
    },
    {
      type: 'check',
      label: 'Deployment scope',
      help: 'Support for broader rollout and implementation requirements.',
      includes: planIndex => planIndex >= 2,
    },
  ]
  const getPlanCtaHref = (_priceId: string): string => {
    if (!isAuthenticated) return '/login?returnUrl=%2Fupgrade'
    return '/upgrade'
  }

  const pricingFaqItems: FAQItem[] = [
    {
      q: 'How do I choose the right plan?',
      a: 'Start with the class that fits your current workload. You can upgrade anytime as your agent count and parallel task needs grow.',
    },
    {
      q: 'Can I switch plans later?',
      a: 'Yes. You can change plans from billing settings. Upgrades are immediate and downgrades can be scheduled.',
    },
    {
      q: 'What happens to my data if I downgrade?',
      a: 'Your workspace data stays intact. If your active usage exceeds lower-tier limits, you may need to reduce usage before downgrade applies.',
    },
    {
      q: 'How are monthly credits granted?',
      a: 'Monthly credits are granted through your subscription billing cycle and added to your starship wallet.',
    },
    {
      q: 'Do you offer a custom enterprise plan?',
      a: 'Yes. Use the Contact us section on this page to email us with what you need.',
    },
    {
      q: 'Where do I manage billing and plan changes?',
      a: 'Once logged in, go to your starship settings under Upgrade/Billing to manage plans and subscription status.',
    },
  ]

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PublicHeader />

      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-6xl flex-col justify-start gap-8 px-4 pt-10 pb-10 sm:gap-10 sm:px-8 sm:pt-16 sm:pb-16 min-h-[calc(100svh-9rem)] md:min-h-[calc(100svh-9.5rem)]">
          <section className="shrink-0 text-center">
            <h1 className="text-balance text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              Simple plans that <span className="text-primary">scale with your automation</span>
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-pretty text-sm text-muted-foreground sm:text-base">Every plan lists your agent limit, parallel-task cap, and monthly credits.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground sm:gap-x-2.5 sm:text-sm">
              <span className="inline-flex items-center gap-1.5 sm:gap-2">
                <Icon name="shield-check" className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="whitespace-nowrap">No hidden fees.</span>
              </span>
              <span className="select-none px-0.5 text-muted-foreground/40 sm:px-1" aria-hidden></span>
              <span className="inline-flex items-center gap-1.5 sm:gap-2">
                <Icon name="arrows-down-up" className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Upgrade or downgrade anytime.</span>
              </span>
            </div>
          </section>

          {(isLoading || isError || selfServePlans.length === 0) ? (
            <section className="w-full shrink-0 pb-2">
              {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[0, 1, 2].map(idx => (
                  <Card key={idx} className="h-72 animate-pulse rounded-none" />
                ))}
              </div>
            ) : isError ? (
              <Card className="mx-auto max-w-2xl rounded-none border-destructive/30">
                <CardHeader>
                  <CardTitle>Couldn&apos;t load plans right now</CardTitle>
                  <CardDescription>Our pricing catalog is temporarily unavailable. Please refresh in a moment.</CardDescription>
                </CardHeader>
              </Card>
            ) : selfServePlans.length === 0 ? (
              <Card className="mx-auto max-w-2xl rounded-none">
                <CardHeader>
                  <CardTitle>No plans available</CardTitle>
                  <CardDescription>There are no active plan entries in the catalog at the moment.</CardDescription>
                </CardHeader>
              </Card>
              ) : null}
            </section>
          ) : null}

          {!isLoading && !isError && selfServePlans.length > 0 ? (
            <section className="w-full shrink-0">
              <div className="overflow-hidden rounded-none bg-[#F8F8FA]">
                <div className="overflow-x-auto overflow-y-hidden">
                  <table className="w-full table-fixed border-collapse text-left">
                    <colgroup>
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '26.66%' }} />
                      <col style={{ width: '26.66%' }} />
                      <col style={{ width: '26.66%' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-white">
                        <th className="px-3 py-4 sm:px-4" />
                        {tableColumns.map((column, idx) => {
                          const isEnterprise = column.kind === 'enterprise'
                          const isRecommended = !isEnterprise && idx === recommendedIndex
                          const shipClass = isEnterprise ? 'enterprise' : column.plan.shipClass
                          const priceLine = isEnterprise ? null : getPlanPriceLine(column.plan.unitAmount, column.plan.currency, column.plan.interval)
                          const cardGlowStyle = planCardGlowStyleByClass[shipClass] ?? planCardGlowStyleByClass.scout
                          const displayName = isEnterprise ? 'Enterprise' : column.plan.displayName
                          const subtitle = isEnterprise
                            ? 'Best for complex teams'
                            : column.plan.shipClass === 'frigate'
                              ? 'Best for growing teams'
                              : 'Best for scaled operations'
                          const ctaHref = isEnterprise ? 'mailto:tech@theingenuity.co' : getPlanCtaHref(column.plan.priceId)
                          const ctaText = isEnterprise ? 'Talk to us' : 'Choose plan'
                          return (
                            <th
                              key={isEnterprise ? 'comparison-header-enterprise' : `comparison-header-${column.plan.priceId}`}
                              className="px-4 py-4 text-center align-top sm:px-5"
                              style={getPlanColumnStyle(shipClass)}
                            >
                              <div
                                className={cn(
                                  'mx-auto h-[20px] w-full rounded-none py-[2px] text-[11px] font-semibold tracking-[0.08em]',
                                  isRecommended ? 'bg-amber-400 text-slate-900' : 'bg-transparent text-transparent'
                                )}
                              >
                                Most popular
                              </div>
                              <div className="relative isolate mx-auto w-full">
                                <div
                                  className={cn(
                                    'relative z-10 flex h-[174px] w-full flex-col overflow-visible rounded-none border bg-[#F8F8FA]',
                                    shipClass === 'frigate'
                                      ? 'border-amber-300 shadow-[3px_3px_0_0_rgb(226_232_240)]'
                                      : 'border-slate-200 shadow-[3px_3px_0_0_rgb(226_232_240)]'
                                  )}
                                >
                                  <div className="pointer-events-none absolute inset-0 z-0 rounded-none" style={cardGlowStyle} aria-hidden />
                                  <div className="relative z-10 flex flex-1 flex-col justify-between px-5 pb-4 pt-4">
                                  <div className="space-y-2">
                                    <div className="text-[30px] leading-[1] font-semibold tracking-tight text-foreground">{displayName}</div>
                                    <div className="mx-auto max-w-[20ch] truncate whitespace-nowrap text-[11px] leading-[1.28] text-muted-foreground">
                                      {subtitle}
                                    </div>
                                    <div className="mt-6 flex items-baseline justify-center gap-0 font-bold tracking-tight text-foreground">
                                      {isEnterprise ? (
                                        <span className="text-3xl">Custom</span>
                                      ) : priceLine?.mode === 'plain' ? (
                                        <span className="text-3xl">{priceLine.text}</span>
                                      ) : (
                                        <>
                                          <span className="text-3xl tabular-nums leading-none">{priceLine?.amount}</span>
                                          <span className="text-sm sm:text-base font-bold tabular-nums leading-none">/{priceLine?.intervalTail}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                    <Link
                                      href={ctaHref}
                                      className={cn(
                                        landingPrimaryCtaSection,
                                        'relative z-10 mt-2 mb-1 w-full justify-center px-2.5 py-1 text-[10px] leading-none font-semibold h-9'
                                      )}
                                    >
                                    {ctaText}
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <TooltipProvider delayDuration={120}>
                        {comparisonRows.map((row, idx) => (
                          <tr key={row.label} className={cn('bg-white', idx !== comparisonRows.length - 1 && 'border-b border-border/60')}>
                            <td className="px-3 py-3 text-[14px] text-foreground sm:px-4">
                              <div className="flex items-center gap-2">
                                <span className="leading-snug">{row.label}</span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white text-[10px] font-semibold text-muted-foreground cursor-help"
                                      aria-label={`About ${row.label}`}
                                    >
                                      i
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs leading-relaxed">{row.help}</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                            {tableColumns.map((column, planIdx) => {
                              const isEnterprise = column.kind === 'enterprise'
                              const shipClass = isEnterprise ? 'enterprise' : column.plan.shipClass
                              const cellKey = isEnterprise ? `${row.label}-enterprise` : `${row.label}-${column.plan.priceId}`
                              if (row.type === 'value') {
                                const detailText =
                                  row.label === 'AI Credits'
                                    ? (isEnterprise ? 'contact sales' : 'included / month')
                                    : row.label === 'AI agents' || row.label === 'Parallel task capacity'
                                      ? (isEnterprise ? 'contact sales' : '')
                                      : ''
                                return (
                                  <td key={cellKey} className="px-4 py-3 text-center sm:px-5" style={getPlanColumnStyle(shipClass)}>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[14px] font-semibold tabular-nums text-foreground">{isEnterprise ? 'Custom' : row.getValue(column.plan)}</span>
                                      {detailText ? <span className="text-[11px] text-muted-foreground">{detailText}</span> : null}
                                    </div>
                                  </td>
                                )
                              }
                              const included = row.includes(planIdx)
                              return (
                                <td key={cellKey} className="px-4 py-3 text-center sm:px-5" style={getPlanColumnStyle(shipClass)}>
                                  <span
                                    className={cn(
                                      'inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[11px] font-bold transition-colors',
                                      included ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-300'
                                    )}
                                    aria-label={included ? 'Included' : 'Not included'}
                                  >
                                    {included ? '✓' : ''}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </TooltipProvider>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8">
          <div className="group relative w-full">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
            </div>
            <div className="relative flex w-full flex-col items-stretch gap-6 overflow-hidden !rounded-none border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-6 py-8 text-white shadow-lg sm:px-8 sm:py-9 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1 text-left">
                <h3 className="text-2xl font-semibold text-white md:text-3xl">Request a custom quote</h3>
                <p className="mt-2 max-w-2xl text-sm text-white/90">Looking for enterprise solutions? Email us what you need.</p>
              </div>
              <a href="mailto:tech@theingenuity.co" className={`${landingWhiteCtaOnGradientLg} shrink-0 self-center md:self-center`}>
                Contact us
              </a>
            </div>
          </div>
        </section>

        <TestimonialsSection />
        <Security />

        <FAQ items={pricingFaqItems} title="Pricing FAQs" sectionTone="white" />
      </main>

      <PublicFooter fromPath="/pricing" showTopDivider={true} topDividerVariant="theme" />
    </div>
  )
}
