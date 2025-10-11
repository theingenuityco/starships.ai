'use client'


import React from 'react'
import type { LedgerEntryModel } from '@starships/protocol'
import { useLedger } from '@/hooks/useLedger'
import { Button } from '@/components/ui/button'

export default function LedgerHistoryTable({ walletId }: { walletId: string }) {
  const { data, isLoading, error } = useLedger(walletId, { page: 1, limit: 20 })

  if (isLoading) {
    return (
      <div className="ip-card-shadow rounded-2xl p-4">
        <h4 className="font-medium">Transaction history</h4>
        <div className="py-6 text-sm text-slate-600 dark:text-slate-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ip-card-shadow rounded-2xl p-4">
        <h4 className="font-medium">Transaction history</h4>
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

  const rows = data?.records ?? []

  return (
    <div className="ip-card-shadow rounded-2xl p-4">
      <h4 className="font-medium">Transaction history</h4>
      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Amount</th>
            <th className="py-2 pr-3">Balance After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: LedgerEntryModel) => (
            <tr key={r.id} className="border-t border-slate-200/60 dark:border-slate-800/60">
              <td className="py-2 pr-3">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="py-2 pr-3">{r.type}</td>
              <td className="py-2 pr-3">{r.amount}</td>
              <td className="py-2 pr-3">{r.balanceAfter}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-4 pr-3 text-slate-500 dark:text-slate-400" colSpan={4}>
                No transactions yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
