'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { landingFrameInset } from '@/app/components/landing/landingSurface'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export function PromptCardWithCopy({ prompt, className = '' }: { prompt: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success('Prompt copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy prompt')
    }
  }, [prompt])

  return (
    <div className={cn('overflow-hidden rounded-none border border-slate-200 bg-slate-50', className)}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
            <Icon name="code" className="h-4 w-4 text-primary shrink-0" />
            <span>PROMPT:</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{prompt}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy prompt'}>
          {copied ? <Icon name="check" className="h-4 w-4 text-emerald-500" /> : <Icon name="copy" className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/** Prompt block styled like a text editor: "Prompt:" label on top, prompt in a box with copy button inside. */
export function PromptEditorBlock({ prompt, className = '' }: { prompt: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success('Prompt copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy prompt')
    }
  }, [prompt])

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon name="code" className="h-4 w-4 text-primary shrink-0" />
        <span>Prompt:</span>
      </div>
      <div className={cn('relative overflow-hidden', landingFrameInset)}>
        <pre className="p-4 pr-14 font-sans text-base leading-relaxed text-slate-700 whitespace-pre-wrap">{prompt}</pre>
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy prompt'}>
          {copied ? <Icon name="check" className="h-4 w-4 text-emerald-500" /> : <Icon name="copy" className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
