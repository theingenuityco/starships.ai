'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export function MarketplaceShareLinkCard({ shareUrl, compact }: { shareUrl: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('h-9 gap-2', compact ? 'px-3' : undefined)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(shareUrl)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        } catch {
          // ignore
        }
      }}
    >
      <Icon name={copied ? 'check' : 'share-2'} className="h-4 w-4" />
      {copied ? 'Copied' : 'Share'}
    </Button>
  )
}

