'use client'

import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface UsageTableProps {
  isDaily: boolean
  loadingList: boolean
  rows: any[]
  numberGroup: (n: number) => string
  usd: (n: number) => string
  formatDay: (s: string) => string
  total: number
}

export function UsageTable({ isDaily, loadingList, rows, numberGroup, usd, formatDay, total }: UsageTableProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center mb-3">
        <div className="ml-auto text-sm text-muted-foreground">Total rows: {numberGroup(total)}</div>
      </div>

      <ScrollArea className="w-full">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="py-2 pr-3 text-left font-medium">Day</th>
                {!isDaily && <th className="py-2 pr-3 text-left font-medium">Model</th>}
                <th className="py-2 pr-3 text-right font-medium">Requests</th>
                <th className="py-2 pr-3 text-right font-medium">Input</th>
                <th className="py-2 pr-3 text-right font-medium">Output</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {loadingList && (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={isDaily ? 6 : 7}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loadingList && rows.length === 0 && (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={isDaily ? 6 : 7}>
                    No usage records
                  </td>
                </tr>
              )}
              {!loadingList &&
                rows.map((r: any, idx: number) => (
                  <tr key={`${isDaily ? r.day : r.day + '-' + (r.model || 'nomodel')}-${idx}`} className="border-b border-border/30">
                    <td className="py-2 pr-3">{formatDay(r.day)}</td>
                    {!isDaily && <td className="py-2 pr-3 font-mono">{r.model ?? '—'}</td>}
                    <td className="py-2 pr-3 text-right">{numberGroup(Number(r.requestCount ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.promptTokens ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.completionTokens ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.totalTokens ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">{usd(Number(r.totals?.cost ?? 0))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </>
  )
}

export default UsageTable
