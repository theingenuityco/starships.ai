'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'

export interface ConnectorSuggestionCardProps {
  starshipId: string
  providers: string[]
  hideSearch?: boolean
  hideDisconnect?: boolean
  className?: string
}

/**
 * ConnectorSuggestionCard
 *
 * Renders one or more connector cards (from the Connectors page UI) inline as a widget.
 * Intended for chat rendering via `render_widget`.
 */
export function ConnectorSuggestionCard({ starshipId, providers, hideSearch = true, hideDisconnect = false, className }: ConnectorSuggestionCardProps): React.JSX.Element {
  const normalized = Array.isArray(providers) ? providers.map(p => String(p ?? '').trim()).filter(Boolean) : []

  if (!starshipId || normalized.length === 0) {
    return (
      <div className={cn('p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20', className)}>
        <p className="text-sm text-red-600 dark:text-red-400">ConnectorSuggestionCard: missing required props.</p>
      </div>
    )
  }

  return (
    <div className={cn('w-full max-w-none', className)}>
      <StarshipConnectorsPanel
        starshipId={starshipId}
        onlyProviders={normalized}
        hideSearch={hideSearch}
        hideDisconnect={hideDisconnect}
        maxColumns={2}
      />
    </div>
  )
}

export default ConnectorSuggestionCard
