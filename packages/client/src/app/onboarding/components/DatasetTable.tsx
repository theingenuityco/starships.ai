'use client'

import { useEffect, useState } from 'react'
import type { IcpAccountPreview } from '@starships/protocol'

const COLUMNS: { key: keyof IcpAccountPreview; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'industry', label: 'Industry' },
  { key: 'size', label: 'Size' },
  { key: 'location', label: 'Location' },
]

const ROW_REVEAL_DELAY_MS = 180

export function DatasetTable({
  accounts,
  isLoading,
}: {
  accounts: IcpAccountPreview[]
  isLoading: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (isLoading || accounts.length === 0) {
      setVisibleCount(0)
      return
    }
    // Reveal rows one by one with a stagger
    let i = 0
    const interval = setInterval(() => {
      i += 1
      setVisibleCount(i)
      if (i >= accounts.length) clearInterval(interval)
    }, ROW_REVEAL_DELAY_MS)
    return () => clearInterval(interval)
  }, [isLoading, accounts])

  return (
    <div className="w-full overflow-x-auto rounded-none border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40"
              >
                {col.label}
              </th>
            ))}
            {/* Blur sentinel column for the "sign up to see more" effect */}
            <th className="w-8 px-2 py-3" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} index={i} />)
            : accounts.map((account, i) => (
                <tr
                  key={i}
                  className="border-b border-white/5 transition-all duration-300"
                  style={{
                    opacity: i < visibleCount ? 1 : 0,
                    transform: i < visibleCount ? 'translateY(0)' : 'translateY(6px)',
                  }}
                >
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-4 py-3 text-white/80">
                      {/* blur last 2 rows as a teaser */}
                      <span className={i >= accounts.length - 2 ? 'select-none blur-[3px]' : ''}>
                        {account[col.key]}
                      </span>
                    </td>
                  ))}
                  <td className="w-8 px-2 py-3" aria-hidden />
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

// Stable widths per column per row to avoid SSR/CSR mismatch
const SKELETON_WIDTHS: number[][] = [
  [80, 70, 65, 45, 75],
  [65, 80, 75, 50, 60],
  [75, 60, 85, 40, 70],
  [70, 75, 60, 55, 80],
  [85, 65, 70, 45, 65],
  [60, 80, 65, 50, 75],
]

function SkeletonRow({ index }: { index: number }) {
  const widths = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]!
  return (
    <tr className="border-b border-white/5">
      {COLUMNS.map((col, colIdx) => (
        <td key={col.key} className="px-4 py-3">
          <div
            className="h-3.5 rounded-none bg-white/10 animate-pulse"
            style={{ width: `${widths[colIdx]}%`, animationDelay: `${index * 80}ms` }}
          />
        </td>
      ))}
      <td className="w-8 px-2 py-3" aria-hidden />
    </tr>
  )
}
