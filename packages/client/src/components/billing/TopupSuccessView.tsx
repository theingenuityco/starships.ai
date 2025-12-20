'use client'

import React, { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { useQueryClient } from '@tanstack/react-query'

import { PageLayout } from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useWallet, WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'

interface TopupSuccessViewProps {
  slug: string
}

export function TopupSuccessView({ slug }: TopupSuccessViewProps): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const topupId = searchParams.get('topupId') ?? undefined
  const amountParam = searchParams.get('amount') ?? undefined
  const CREDITS_PER_USD = 200

  const { data: starship, isLoading: starshipLoading, error: starshipError } = useStarshipBySlug(slug, true)

  const starshipId = starship?.id ?? ''

  useEffect(() => {
    if (starshipId) {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
    }
  }, [queryClient, starshipId])
  const { data: wallet, isLoading: walletLoading, error: walletError } = useWallet(starshipId, Boolean(starshipId))

  const amountAdded = useMemo(() => {
    if (!amountParam) return null
    const parsed = Number(amountParam)
    if (Number.isNaN(parsed)) return null
    return parsed.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  }, [amountParam])

  const creditsAdded = useMemo(() => {
    if (!amountParam) return null
    const parsed = Number(amountParam)
    if (Number.isNaN(parsed)) return null
    return Math.round(parsed * CREDITS_PER_USD).toLocaleString()
  }, [amountParam])

  const currentBalance = useMemo(() => {
    if (!wallet) return null
    const parsed = Number(wallet.balance ?? 0)
    if (Number.isNaN(parsed)) return null
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }, [wallet])

  const loading = starshipLoading || walletLoading

  const hasError = !!starshipError || !!walletError

  return (
    <PageLayout showHeader={false}>
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10">
            <section
              className={cn(
                'relative overflow-hidden rounded-3xl border border-emerald-500/10 bg-gradient-to-br from-white/80 via-emerald-50/70 to-white/60',
                'p-8 shadow-xl shadow-emerald-500/10 backdrop-blur-xl dark:from-emerald-900/20 dark:via-emerald-900/10 dark:to-emerald-950/10'
              )}
            >
              <div className="absolute right-10 top-10 hidden h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl lg:block" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4">
                  <Badge className="w-fit bg-emerald-500/10 text-emerald-700 backdrop-blur-sm dark:bg-emerald-500/20 dark:text-emerald-200" variant="secondary">
                    <Icon name="sparkles" className="mr-1 h-3.5 w-3.5" />
                    Payment successful
                  </Badge>
                  <div>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Wallet boost confirmed</h1>
                    <p className="mt-3 max-w-xl text-base text-slate-600 dark:text-slate-300">
                      {amountAdded && creditsAdded
                        ? `${creditsAdded} credits from your ${amountAdded} purchase have landed safely in ${starship?.name ?? 'your starship'}’s wallet.`
                        : `Fresh credits have landed safely in ${starship?.name ?? 'your starship'}’s wallet.`}{' '}
                      You’re clear to launch the next workflow.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button size="lg" className="group bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => router.push(`/ship/${slug}/settings/billing`)}>
                      Return to billing
                      <Icon name="arrow-right" className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-200"
                      onClick={() => router.push(`/ship/${slug}/settings/usage`)}
                    >
                      View usage analytics
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-6 py-4 shadow-lg shadow-emerald-200/40 backdrop-blur-lg dark:bg-emerald-950/30">
                  <Icon name="check-circle" className="h-9 w-9 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-300">Top-up reference</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{topupId ? topupId.slice(0, 10).toUpperCase() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[2fr,1fr] lg:items-stretch">
                <Card className="flex h-full flex-col border-emerald-500/10 bg-white/70 backdrop-blur dark:border-emerald-500/20 dark:bg-emerald-950/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-6">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-900 dark:text-white">
                        <Icon name="wallet" className="h-5 w-5 text-emerald-500" />
                        Wallet overview
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Current balance and latest credit details</p>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200">Live</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/80 p-4 text-center dark:border-emerald-500/20 dark:bg-emerald-900/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Wallet balance</p>
                        <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-100">{currentBalance ?? (loading ? '...' : '0')} cr</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-center dark:border-slate-700 dark:bg-slate-900/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Amount added</p>
                        <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">{creditsAdded ? `${creditsAdded} cr` : 'Pending'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{amountAdded ? `Paid ${amountAdded} via Stripe.` : 'Reflects the credits from this session.'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-center dark:border-slate-700 dark:bg-slate-900/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Starship</p>
                        <p className="mt-2 text-xl font-semibold text-slate-800 dark:text-slate-100">{starship?.name ?? (loading ? 'Loading...' : slug)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Wallet ID: {wallet?.id ? wallet.id.slice(0, 8) : 'pending'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-700/50 dark:bg-slate-900/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Icon name="mail" className="h-4 w-4 text-primary" />
                      Need a receipt?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>
                      We’ll send the Stripe invoice and receipt to your billing email automatically. If you need any assistance, reach out to{' '}
                      <a className="font-medium text-primary underline-offset-2 hover:underline" href="mailto:prashant.p@theingenuity.co">
                        prashant.p@theingenuity.co
                      </a>
                      .
                    </p>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      Reference this Top-up ID with support: <span className="font-mono">{topupId ?? 'N/A'}</span>
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200/70 bg-white/70 backdrop-blur dark:border-slate-700/50 dark:bg-slate-900/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">Recommended next steps</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <div className="flex items-start gap-3">
                      <Icon name="bot" className="mt-1 h-5 w-5 text-primary" />
                      <div className="space-y-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">Launch a new agent</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">Browse the marketplace and deploy an operator tailored to this mission.</p>
                        </div>
                        <Button variant="link" className="px-0 text-primary" asChild>
                          <Link href="/marketplace">Open marketplace</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <div className="flex items-start gap-3">
                      <Icon name="message-square" className="mt-1 h-5 w-5 text-primary" />
                      <div className="space-y-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">Start a conversation</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">Test your agents instantly or brief the crew with new objectives.</p>
                        </div>
                        <Button variant="link" className="px-0 text-primary" asChild>
                          <Link href={`/ship/${slug}/conversations`}>Open conversations</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <div className="flex items-start gap-3">
                      <Icon name="user-cog" className="mt-1 h-5 w-5 text-primary" />
                      <div className="space-y-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">Refresh your profile</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">Keep billing contacts and notification preferences up to date.</p>
                        </div>
                        <Button variant="link" className="px-0 text-primary" asChild>
                          <Link href="/profile">Update profile</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {hasError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-900/20 dark:text-red-200">
                We had trouble loading fresh data for your wallet. Everything is still processed on Stripe, but you may need to refresh this page or revisit the billing tab to see the latest numbers.
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
