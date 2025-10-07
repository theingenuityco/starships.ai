'use client'

import React from 'react'
import type { LedgerEntryModel } from '@starships/protocol'
import { useLedger } from '@/hooks/useLedger'

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
        <div className="py-6 text-sm text-red-600 dark:text-red-400">Failed to load ledger</div>
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
