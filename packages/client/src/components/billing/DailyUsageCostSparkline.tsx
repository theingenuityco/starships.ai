'use client'

import { useStarshipDailyUsageList } from '@/hooks/useUsage'
import React, { useMemo } from 'react'

interface DailyUsageCostSparklineProps {
  starshipId: string
  inline?: boolean
}

export function DailyUsageCostSparkline({ starshipId, inline = false }: DailyUsageCostSparklineProps): React.JSX.Element | null {
  // Only pass starshipId if it's a valid non-empty string
  const validStarshipId = starshipId && starshipId.trim() !== '' ? starshipId : null

  const { data, isLoading } = useStarshipDailyUsageList(validStarshipId, {
    limit: 30,
    order: 'ASC',
  })

  const sparklineData = useMemo<{
    points: { x: number; y: number }[]
    path: string
  } | null>(() => {
    // Return null if no real data available
    if (!data?.records || data.records.length === 0) {
      return null
    }

    const costs = data.records.map(r => r.totals.cost || 0)
    const maxCost = Math.max(...costs, 0.01)
    const minCost = Math.min(...costs)
    const range = maxCost - minCost || 0.01

    // Calculate points for SVG path with padding to prevent clipping
    const width = 100
    const height = 40
    const padding = 3 // Padding to prevent edge clipping
    const usableWidth = width - padding * 2
    const usableHeight = height - padding * 2

    const points = costs.map((cost, i) => {
      const x = costs.length > 1 ? padding + (i / (costs.length - 1)) * usableWidth : width / 2
      const y = padding + usableHeight - ((cost - minCost) / range) * usableHeight
      return { x, y }
    })

    return {
      points,
      path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' '),
    }
  }, [data])

  return (
    <div className="relative rounded-md py-2">
      <svg viewBox="0 0 100 40" className="w-full h-12 bg-transparent overflow-visible" preserveAspectRatio="xMidYMid meet">
        {isLoading || !sparklineData ? (
          // Placeholder line with same dimensions
          <line x1="3" y1="20" x2="97" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.2" className="animate-pulse" />
        ) : (
          <>
            <defs>
              <filter id="sparkline-glow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="white" stopOpacity="0.7" />
                <stop offset="100%" stopColor="white" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path d={sparklineData.path} fill="none" stroke="url(#sparkline-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter="url(#sparkline-glow)" />
            {sparklineData.points.map((point, i) => (
              <circle key={i} cx={point.x} cy={point.y} r="0.6" fill="white" fillOpacity="0.8" filter="url(#sparkline-glow)" />
            ))}
          </>
        )}
      </svg>
    </div>
  )
}
