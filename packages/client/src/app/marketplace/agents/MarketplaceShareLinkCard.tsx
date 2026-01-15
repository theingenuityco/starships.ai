'use client'

import { useMemo, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { toast } from 'sonner'

export function MarketplaceShareLinkCard({ shareUrl }: { shareUrl: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle')

  const normalized = useMemo(() => String(shareUrl || '').trim(), [shareUrl])
  const canCopy = normalized.length > 0

  const canNativeShare = (): boolean => {
    try {
      return typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.share === 'function'
    } catch {
      return false
    }
  }

  const isProbablyMobile = (): boolean => {
    try {
      // Prefer capability-based detection over UA sniffing.
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        if (window.matchMedia('(pointer: coarse)').matches) return true
      }
    } catch {
      // ignore
    }
    return false
  }

  const handleShare = async () => {
    if (!canCopy) return

    // Prefer native share sheet when available.
    try {
      if (isProbablyMobile() && canNativeShare()) {
        await navigator.share({ url: normalized })
        setStatus('shared')
        window.setTimeout(() => setStatus('idle'), 1500)
        return
      }
    } catch {
      // Fall back to copy when share is canceled/unavailable.
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(normalized)
      } else {
        throw new Error('Clipboard API unavailable')
      }
    } catch {
      // Non-deprecated fallback: prompt user to copy manually.
      // (Avoids `document.execCommand('copy')`, which is deprecated/unreliable.)
      window.prompt('Copy this link:', normalized)
      toast.message('Copy the link from the prompt')
      return
    }

    setStatus('copied')
    window.setTimeout(() => setStatus('idle'), 1500)
    toast.success('Link copied')
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-5">
      <div className="text-sm font-semibold text-foreground">Share this agent</div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Send this agent to your team so everyone can review it before you deploy.
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleShare}
          disabled={!canCopy}
          className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold border border-border/60 bg-background/40 hover:bg-accent/60 text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Share link"
        >
          {status === 'copied' ? (
            <>
              <Icon name="check" className="h-4 w-4" />
              Copied
            </>
          ) : status === 'shared' ? (
            <>
              <Icon name="check" className="h-4 w-4" />
              Shared
            </>
          ) : (
            <>
              <Icon name="link" className="h-4 w-4" iconOverride={{ type: 'phosphor', component: 'LinkSimple' }} />
              Share
            </>
          )}
        </button>
      </div>
    </div>
  )
}

