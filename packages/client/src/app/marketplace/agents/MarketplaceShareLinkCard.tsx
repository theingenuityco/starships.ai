'use client'

import { useMemo, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { toast } from 'sonner'

export function MarketplaceShareLinkCard({ shareUrl }: { shareUrl: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle')

  const normalized = useMemo(() => String(shareUrl || '').trim(), [shareUrl])
  const canCopy = normalized.length > 0

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
      const navAny = navigator as any
      if (isProbablyMobile() && typeof navAny?.share === 'function') {
        await navAny.share({ url: normalized })
        setStatus('shared')
        window.setTimeout(() => setStatus('idle'), 1500)
        return
      }
    } catch {
      // Fall back to copy when share is canceled/unavailable.
    }

    try {
      await navigator.clipboard.writeText(normalized)
    } catch {
      // Fallback for older browsers / permission issues
      const ta = document.createElement('textarea')
      ta.value = normalized
      ta.setAttribute('readonly', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    setStatus('copied')
    window.setTimeout(() => setStatus('idle'), 1500)
    toast.success('Link copied')
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur supports-[backdrop-filter]:bg-card/30 p-5">
      <div className="text-sm font-semibold text-foreground">Share this agent</div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Send this agent to your team so everyone can review it before you deploy.
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleShare}
          disabled={!canCopy}
          className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl text-xs font-semibold border border-border/60 bg-background/40 hover:bg-accent/60 text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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

