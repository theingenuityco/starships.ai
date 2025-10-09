'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ArrowRight, HelpCircle, LifeBuoy, ShieldAlert, Wallet } from 'lucide-react'

import { PageLayout } from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface TopupFailureViewProps {
  slug: string
}

export function TopupFailureView({ slug }: TopupFailureViewProps): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()

  const topupId = searchParams.get('topupId') ?? undefined
  const reason = searchParams.get('reason') ?? undefined
  const stripeStatus = searchParams.get('status') ?? undefined

  return (
    <PageLayout showHeader={false}>
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-6 lg:px-8">
          <div className="space-y-10">
            <section className="overflow-hidden rounded-3xl border border-rose-500/15 bg-white/80 p-8 shadow-2xl shadow-rose-200/30 backdrop-blur-xl dark:border-rose-500/25 dark:bg-rose-950/30 dark:shadow-rose-900/30">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4">
                  <Badge className="w-fit bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" variant="secondary">
                    <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                    Payment interrupted
                  </Badge>
                  <div>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Your top-up didn’t complete</h1>
                    <p className="mt-3 max-w-xl text-base text-slate-600 dark:text-slate-300">
                      Stripe stopped this transaction before credits could be added to your wallet. Let’s get you back on track.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button size="lg" className="group bg-rose-600 text-white hover:bg-rose-700" onClick={() => router.push(`/ship/${slug}/management?tab=billing`)}>
                      Retry top-up
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-200"
                      onClick={() => router.push(`/ship/${slug}/management`)}
                    >
                      Back to management
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-6 py-4 shadow-lg shadow-rose-200/30 backdrop-blur-lg dark:bg-rose-950/40">
                  <AlertTriangle className="h-9 w-9 text-rose-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-300">Top-up reference</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{topupId ? topupId.slice(0, 10).toUpperCase() : 'Unavailable'}</p>
                    {stripeStatus && <p className="text-xs text-muted-foreground">Stripe status: {stripeStatus.replace(/_/g, ' ')}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="border-rose-500/10 bg-white/80 backdrop-blur dark:border-rose-500/20 dark:bg-rose-950/30">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <Wallet className="h-5 w-5 text-rose-500" />
                    What happened?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                  <div className="rounded-2xl border border-dashed border-rose-500/25 bg-rose-100/40 p-4 dark:border-rose-500/30 dark:bg-rose-900/30">
                    {reason ? (
                      <p className="text-sm">Stripe reported the following reason: “{reason.replace(/_/g, ' ')}”.</p>
                    ) : (
                      <p className="text-sm">Stripe could not finalize the payment—this usually occurs when the bank declines the charge, the session expires, or the customer cancels the redirect.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">No funds were debited</p>
                    <p>Because the payment was aborted before completion, no credits were added and no balance changes were recorded in your wallet.</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="font-medium text-slate-900 dark:text-white">Safety checks in place</p>
                    <p>We only mark top-ups as completed after Stripe confirms the charge. Your wallet and ledger remain unchanged if that signal never arrives.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-700/50 dark:bg-slate-900/40">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <HelpCircle className="h-5 w-5 text-primary" />
                    Suggested actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                  <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Try the top-up again</p>
                    <p className="mt-1">Re-launch Stripe Checkout from the billing tab. Many failures resolve on a second attempt, especially after updating card details.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Check bank or card limits</p>
                    <p className="mt-1">Some institutions block first-time or high-value charges. A quick call or mobile notification approval usually clears things up.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-700/50 dark:bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Contact support if needed</p>
                    <p className="mt-1">Still stuck? Have the Top-up reference handy and reach out so we can inspect the Stripe logs on your behalf.</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
              <Card className="border-slate-200/60 bg-white/80 backdrop-blur dark:border-slate-700/50 dark:bg-slate-900/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">Need a detailed audit?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <p>Stripe logs every redirect and decline reason. Visit the billing tab and export the ledger to confirm all wallet transactions. You can safely initiate a new top-up when ready.</p>
                  <Separator />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className="border-slate-300 text-slate-700 hover:bg-slate-200/50 dark:border-slate-600 dark:text-slate-200"
                      onClick={() => router.push(`/ship/${slug}/management?tab=billing`)}
                    >
                      Go to billing
                    </Button>
                    <Button variant="ghost" className="text-slate-500 hover:text-slate-700 dark:text-slate-300">
                      Learn about Stripe safeguards
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-rose-500/20 bg-rose-100/40 backdrop-blur dark:border-rose-500/30 dark:bg-rose-900/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-200">
                    <LifeBuoy className="h-4 w-4" />
                    Priority support
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-rose-800 dark:text-rose-200/80">
                  <p>Send us your top-up reference and timestamps and we'll coordinate directly with Stripe to surface the exact failure reason.</p>
                  <Button variant="secondary" className="w-full bg-white/80 text-rose-700 hover:bg-white dark:bg-rose-50/20 dark:text-rose-200" onClick={() => router.push('/support')}>
                    Contact support
                  </Button>
                </CardContent>
              </Card>
            </section>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ArrowLeft className="h-3 w-3" />
            <button type="button" className="underline-offset-2 transition hover:underline" onClick={() => router.back()}>
              Back to previous page
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
