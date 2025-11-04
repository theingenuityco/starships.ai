import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { motion, useAnimate } from 'motion/react'
import confetti from 'canvas-confetti'
import Icon from '@/components/primitives/Icon'
import { DeployedToolCard } from '@/components/tools/DeployedToolCard'
import type { ToolModel } from '@starships/protocol'

interface ToolCreatedModalProps {
  open: boolean
  names: string[]
  onOpenChange: (open: boolean) => void
  onOpenTool?: (slugOrName?: string) => void
  slugs?: string[]
  tools?: ToolModel[]
}

export function ToolCreatedModal({ open, names, onOpenChange, onOpenTool, slgs, slugs, tools }: any) {
  // Back-compat props support (slgs typo guard)
  if (!Array.isArray(slugs) && Array.isArray(slgs)) slugs = slgs
  const uniqueNames = Array.isArray(names) ? Array.from(new Set(names.filter(n => typeof n === 'string' && n.trim()))).slice(0, 10) : []
  const baseTitle = useMemo(() => {
    if (uniqueNames.length > 1) return `${uniqueNames.length} tools are ready`
    const single = (uniqueNames[0] || '').trim()
    return single ? `${single} is ready` : 'Your tool is ready'
  }, [uniqueNames])
  const primaryName = useMemo(() => uniqueNames[0] || '', [uniqueNames])
  const primarySlug = useMemo(() => (Array.isArray(slugs) && (slugs[0] || '')) || '', [slugs])
  const [mounted, setMounted] = useState(false)
  const [scope, animate] = useAnimate()
  const primaryCtaRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const triggerConfetti = useCallback(() => {
    if (typeof window === 'undefined') return
    const count = 180
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
      setTimeout(() => triggerConfetti(), 450)
      setTimeout(() => {
        try {
          primaryCtaRef.current?.focus({ preventScroll: true } as any)
        } catch {}
      }, 200)
    }
  }, [open, mounted, triggerConfetti])

  const handleOpenTool = useCallback(() => {
    const id = (primarySlug || primaryName || '').trim()
    onOpenTool?.(id)
  }, [onOpenTool, primarySlug, primaryName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={e => e.preventDefault()}
        className="sm:max-w-[520px] p-0 gap-0 border-0 shadow-none bg-transparent overflow-visible outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 rounded-3xl sm:rounded-3xl"
      >
        <div className="relative rounded-3xl">
          <div className="absolute inset-0 rounded-3xl video-glow pointer-events-none" aria-hidden />
          <div className="absolute inset-0 rounded-3xl video-blur-border pointer-events-none" aria-hidden />

          <div className="relative bg-background rounded-3xl overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                ref={scope}
                animate={{
                  background: [
                    'radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 50%)',
                    'radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)',
                    'radial-gradient(circle at 40% 60%, rgba(236, 72, 153, 0.08) 0%, transparent 50%)',
                    'radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 50%)',
                  ],
                }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0"
              />
            </div>

            <div className="relative p-8">
              <div className="text-center mb-6">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">
                    <span className="mr-2 align-[-2px]" aria-hidden>
                      🎉
                    </span>
                    <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">{baseTitle}</span>
                  </DialogTitle>
                </DialogHeader>
              </div>

              {/* Tool Cards (preferred) or fallback list */}
              {Array.isArray(tools) && tools.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 mb-6">
                  {tools.map((t, idx) => (
                    <motion.div key={(t as any)?.id || (t as any)?.slug || t.name || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + idx * 0.04 }}>
                      <DeployedToolCard tool={t as ToolModel} onClick={() => onOpenTool?.((t as any)?.slug || t.name)} onOpen={() => onOpenTool?.((t as any)?.slug || t.name)} showActions={false} />
                    </motion.div>
                  ))}
                </div>
              ) : uniqueNames.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 mb-6">
                  {uniqueNames.map((name, idx) => (
                    <motion.div key={`${name}-${idx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + idx * 0.04 }}>
                      <div className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-xl relative overflow-hidden transition-all duration-300 cursor-pointer border-border/20 hover:border-border/40 rounded-xl border p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-6 w-6 rounded-full ring-1 ring-border/40 flex items-center justify-center bg-muted/20">
                            <Icon name="wrench" className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{name}</div>
                            <div className="text-xs text-muted-foreground truncate">Draft tool is ready</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={e => {
                            e.stopPropagation()
                            onOpenTool?.(primarySlug || name)
                          }}
                        >
                          <Icon name="external-link" className="mr-1 h-3.5 w-3.5" />
                          Open
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : null}

              {/* Bottom CTAs */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="grid grid-cols-1 gap-3">
                  {(primarySlug || primaryName) && (
                    <Button
                      type="button"
                      size="lg"
                      onClick={handleOpenTool}
                      className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all bg-primary text-primary-foreground gap-1.5"
                      ref={primaryCtaRef}
                    >
                      <Icon name="wrench" className="w-5 h-5" />
                      <span className="truncate">Open in Tool Builder</span>
                    </Button>
                  )}

                  <Button type="button" size="lg" variant="ghost" onClick={() => onOpenChange(false)} className="w-full gap-1.5">
                    <Icon name="x" className="w-5 h-5" />
                    <span className="truncate">Close</span>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ToolCreatedModal


