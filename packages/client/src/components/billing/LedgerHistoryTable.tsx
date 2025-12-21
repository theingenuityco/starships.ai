'use client'

import React, { useMemo, useState } from 'react'
import type { LedgerEntryModel } from '@starships/protocol'
import { useLedger } from '@/hooks/useLedger'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatCredits(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatSignedCredits(n: number): { text: string; isNegative: boolean } {
  const v = Number.isFinite(n) ? n : 0
  const isNegative = v < 0
  const abs = Math.abs(v)
  return { text: `${isNegative ? '-' : ''}${formatCredits(abs)} cr`, isNegative }
}

export default function LedgerHistoryTable({
  walletId,
  view = 'billing',
  title = 'Transaction history',
  variant = 'card',
  showTitle = true,
}: {
  walletId: string
  view?: 'billing' | 'full'
  title?: string
  variant?: 'card' | 'bare'
  showTitle?: boolean
}) {
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const { data, isLoading, error } = useLedger(walletId, { page, limit, order: 'DESC', view })

  const rows = data?.records ?? []
  const pagination = data?.pagination
  const pageInfo = useMemo(() => {
    const total = pagination?.total ?? 0
    const start = rows.length ? (page - 1) * limit + 1 : 0
    const end = rows.length ? (page - 1) * limit + rows.length : 0
    return { total, start, end }
  }, [pagination, rows.length, page, limit])

  if (isLoading) {
    return (
      <div className={cn(variant === 'card' ? 'ip-card-shadow rounded-2xl p-4' : undefined)}>
        {showTitle ? <h4 className="font-medium">{title}</h4> : null}
        <div className="py-6 text-sm text-slate-600 dark:text-slate-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn(variant === 'card' ? 'ip-card-shadow rounded-2xl p-4' : undefined)}>
        {showTitle ? <h4 className="font-medium">{title}</h4> : null}
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">Unable to Load History</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-4">Transaction history is temporarily unavailable</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(variant === 'card' ? 'ip-card-shadow rounded-2xl p-4' : undefined)}>
      <div className={cn('flex items-center', showTitle ? 'justify-between' : 'justify-end')}>
        {showTitle ? <h4 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h4> : null}
        {pagination && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing {pageInfo.start}-{pageInfo.end} of {pageInfo.total}
          </div>
        )}
      </div>
      <table className={cn('w-full text-sm', showTitle ? 'mt-4' : 'mt-0')}>
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Details</th>
            <th className="py-2 pr-3">Amount</th>
            <th className="py-2 pr-3">Balance After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: LedgerEntryModel) => {
            const meta = (r.meta as any) || {}
            let details: string = ''
            if (r.type === 'TOPUP') {
              const usd = meta.amountUsd ? `$${Number(meta.amountUsd).toFixed(2)}` : null
              details = meta.stripePaymentIntent
                ? `Stripe PI ${String(meta.stripePaymentIntent).slice(-8)}${usd ? ` (${usd})` : ''}`
                : meta.topupId
                  ? `Topup ${meta.topupId}${usd ? ` (${usd})` : ''}`
                  : `Credit purchase${usd ? ` (${usd})` : ''}`
            } else if (r.type === 'REFUND') {
              details = meta.stripeChargeId ? `Refund for charge ${String(meta.stripeChargeId).slice(-8)}` : 'Refund issued'
            } else if (r.type === 'ADJUSTMENT') {
              if (meta.reason === 'WELCOME_CREDIT' || meta.reason === 'WELCOME_CREDIT_BACKFILL') {
                details = 'Welcome credit'
              } else {
                details = meta.promoCode ? `Promo ${meta.promoCode}` : 'Adjustment'
              }
            } else if (r.type === 'USAGE') {
              const model = meta.model ? String(meta.model) : null
              const tokens = Number.isFinite(Number(meta.totalTokens)) ? `${Number(meta.totalTokens).toLocaleString()} tokens` : null
              const convo = meta.conversationId ? `Convo ${String(meta.conversationId).slice(-8)}` : null
              details = [model, tokens, convo].filter(Boolean).join(' • ') || 'Usage'
            }
            const amountSigned = formatSignedCredits(Number(r.amount))
            const balanceAfter = formatCredits(Number(r.balanceAfter))
            return (
              <tr key={r.id} className="border-t border-slate-200/60 dark:border-slate-800/60">
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      'px-2 py-0.5 rounded-full text-[11px] font-medium ' +
                      (r.type === 'TOPUP'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                        : r.type === 'REFUND'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                          : r.type === 'USAGE'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200')
                    }
                  >
                    {r.type}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{details}</td>
                <td className={'py-2 pr-3 whitespace-nowrap ' + (amountSigned.isNegative ? 'text-rose-700 dark:text-rose-300' : '')}>
                  {amountSigned.text}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{balanceAfter} cr</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td className="py-4 pr-3 text-slate-500 dark:text-slate-400" colSpan={5}>
                No transactions yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {pagination && (
        <div
          className={cn(
            'mt-4 gap-4',
            showTitle ? 'flex items-center justify-between' : 'flex flex-col items-end justify-end gap-2',
          )}
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {Math.max(1, Math.ceil((pagination.total ?? 0) / limit))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
