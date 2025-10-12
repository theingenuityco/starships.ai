'use client'

import React, { useMemo, useState } from 'react'
import { usePromoRedeem } from '@/hooks/usePromo'
import { useQueryClient } from '@tanstack/react-query'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { Button } from '@/components/ui/button'

type KnownPromoErrorCode = 'PROMO_CODE_INVALID' | 'PROMO_CODE_EXPIRED' | 'PROMO_CODE_EXHAUSTED' | 'RESOURCE_CONFLICT' | 'FORBIDDEN' | 'UNAUTHORIZED'

function mapPromoError(error: any): { code?: KnownPromoErrorCode | string; message: string } {
  const code: string | undefined = error?.response?.data?.error?.code || error?.data?.error?.code || error?.code || error?.response?.data?.code

  switch (code as KnownPromoErrorCode) {
    case 'RESOURCE_CONFLICT':
      return { code, message: 'You’ve already used this promo code.' }
    case 'PROMO_CODE_INVALID':
      return { code, message: 'That code isn’t valid. Check the spelling and try again.' }
    case 'PROMO_CODE_EXPIRED':
      return { code, message: 'This promo code has expired or is no longer active.' }
    case 'PROMO_CODE_EXHAUSTED':
      return { code, message: 'This promo code has already been fully used.' }
    case 'FORBIDDEN':
      return { code, message: 'You don’t have access to redeem a code for this starship.' }
    case 'UNAUTHORIZED':
      return { code, message: 'Please sign in to redeem a promo code.' }
    default: {
      const fallback = error?.response?.data?.error?.message || error?.message || 'Unable to redeem code right now.'
      return { code, message: fallback }
    }
  }
}

export default function PromoRedeemForm({ starshipId }: { starshipId: string }) {
  const [code, setCode] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const redeemMutation = usePromoRedeem()

  const canSubmit = useMemo(() => code.trim().length > 0 && !redeemMutation.isPending, [code, redeemMutation.isPending])

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const result = await redeemMutation.mutateAsync({ code: code.trim(), starshipId })
      // Refresh wallet balance
      await queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
      setSuccessMsg(result?.message || 'Promo applied successfully.')
      setCode('')
    } catch (err: any) {
      const mapped = mapPromoError(err)
      setErrorMsg(mapped.message)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-br from-white/60 to-slate-50/40 dark:from-slate-900/50 dark:to-slate-900/30 backdrop-blur-sm p-5 pb-2 shadow-sm transition">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 12H4" />
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Have a promo code?</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">Apply a code to add credits to your wallet instantly.</div>
        </div>
      </div>
      <form onSubmit={onRedeem} className="flex flex-col gap-3 mb-4">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Enter promo code"
            className="flex-1 h-10 rounded-xl border border-slate-300/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button type="submit" disabled={!canSubmit} className="h-10 rounded-xl px-5">
            {redeemMutation.isPending ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </form>
      {errorMsg && (
        <div
          className="mb-3 rounded-lg border border-red-200/60 dark:border-red-800/60 bg-red-50/70 dark:bg-red-950/30 px-3 py-2 text-sm text-red-800 dark:text-red-200"
          role="alert"
          aria-live="polite"
        >
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div
          className="mb-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
          role="status"
          aria-live="polite"
        >
          {successMsg}
        </div>
      )}
    </div>
  )
}
