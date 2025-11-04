import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { motion, useAnimate } from 'motion/react'
import confetti from 'canvas-confetti'
import Icon from '@/components/primitives/Icon'

interface ToolCreatedModalProps {
  open: boolean
  names: string[]
  onOpenChange: (open: boolean) => void
  onOpenTool?: (slugOrName?: string) => void
  slugs?: string[]
}

export function ToolCreatedModal({ open, names, onOpenChange, onOpenTool, slugs }: ToolCreatedModalProps) {
  const uniqueNames = useMemo(() => Array.from(new Set((Array.isArray(names) ? names : []).map(n => String(n || '').trim()).filter(Boolean))), [names])
  const baseTitle = useMemo(() => {
    if (uniqueNames.length > 1) return `${uniqueNames.length} tools are ready`
    const single = (uniqueNames[0] || '').trim()
    return single ? `${single} is ready` : 'Your tool is ready'
  }, [uniqueNames])
  const primaryName = useMemo(() => uniqueNames[0] || '', [uniqueNames])
  const primarySlug = useMemo(() => (Array.isArray(slugs) && slugs[0]) || '', [slugs])
  const [mounted, setMounted] = useState(false)
  const [scope, animate] = useAnimate()
  const primaryCtaRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const triggerConfetti = useCallback(() => {
    if (typeof window === 'undefined') return
    const count = 160
    const defaults = { origin: { y: 0.75 }, zIndex: 10000 }
    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
        colors: ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'],
      })
    }
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }, [])

  useEffect(() => {
    if (open && mounted) {
      try {
        triggerConfetti()
        setTimeout(() => primaryCtaRef.current?.focus(), 80)
        animate(scope.current, { scale: [0.98, 1] }, { duration: 0.22 })
      } catch {}
    }
  }, [open, mounted, scope, animate, triggerConfetti])

  const subTitle = useMemo(() => {
    if (uniqueNames.length > 1) return 'You can open them in the Tool Builder now.'
    return 'Open it in the Tool Builder to review and iterate.'
  }, [uniqueNames])

  const handleOpenTool = useCallback(() => {
    const id = (primarySlug || primaryName || '').trim()
    onOpenTool?.(id)
  }, [onOpenTool, primarySlug, primaryName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Icon name="wrench" className="w-5 h-5 text-primary" />
            {baseTitle}
          </DialogTitle>
          <DialogDescription>{subTitle}</DialogDescription>
        </DialogHeader>
        <div ref={scope} className="mt-2 space-y-3">
          {uniqueNames.length > 0 ? (
            <ul className="space-y-2">
              {uniqueNames.map((n, idx) => (
                <li key={`${n}-${idx}`} className="flex items-center gap-2">
                  <Icon name="check-circle" className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-foreground">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">A new tool has been created.</div>
          )}
        </div>
        <DialogFooter className="mt-3">
          <div className="flex items-center gap-2 ml-auto">
            <Button ref={primaryCtaRef} onClick={handleOpenTool}>
              <Icon name="external-link" className="w-4 h-4 mr-1" /> Open in Tool Builder
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ToolCreatedModal


