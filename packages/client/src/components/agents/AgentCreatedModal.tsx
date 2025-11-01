import React, { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { motion, useAnimate } from 'motion/react'
import confetti from 'canvas-confetti'
import Icon from '@/components/primitives/Icon'

interface AgentCreatedModalProps {
  open: boolean
  names: string[]
  onOpenChange: (open: boolean) => void
  onChatWithAgent?: (agentName: string) => void
  onAskDaedalusCreateTools?: (agentName: string) => void
}

export function AgentCreatedModal({ open, names, onOpenChange, onChatWithAgent, onAskDaedalusCreateTools }: AgentCreatedModalProps) {
  const uniqueNames = Array.isArray(names) ? Array.from(new Set(names.filter(n => typeof n === 'string' && n.trim()))).slice(0, 10) : []
  const title = uniqueNames.length > 1 ? 'Agents created' : 'Agent created'
  const [mounted, setMounted] = useState(false)
  const [scope, animate] = useAnimate()

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
    }
  }, [open, mounted, triggerConfetti])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 border-0 bg-transparent shadow-none overflow-visible">
        <motion.div
          ref={scope}
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.6 }}
          className="relative bg-background border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
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
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 20 }}
                className="relative inline-block mb-4"
              >
                <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ delay: 0.7, duration: 0.6, ease: 'easeInOut' }} className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-pink-500/30 rounded-2xl blur-xl -z-10"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                    <Icon name="sparkles" className="w-7 h-7 text-primary" />
                  </div>
                </motion.div>
              </motion.div>

              <DialogHeader>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">{title}</DialogTitle>
                <DialogDescription>{uniqueNames.length > 1 ? 'The following agents were created:' : 'Agent has been created:'}</DialogDescription>
              </DialogHeader>
            </div>

            {/* Agents List */}
            {uniqueNames.length > 0 && (
              <div className="space-y-3 mb-6">
                {uniqueNames.map((name, idx) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05 }}
                    className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 bg-gradient-to-br from-background to-muted/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-primary">{(name || '?').slice(0, 1).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{name}</div>
                        <div className="text-xs text-muted-foreground truncate">Draft agent is ready</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChatWithAgent?.(name)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium hover:bg-primary/10"
                      >
                        <Icon name="message-square" className="w-4 h-4" />
                        Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskDaedalusCreateTools?.(name)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:opacity-90"
                      >
                        <Icon name="hammer" className="w-4 h-4" />
                        Ask Daedalus
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Primary CTA when single agent */}
            {uniqueNames.length === 1 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onChatWithAgent?.(uniqueNames[0])}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/50 px-4 py-2.5 text-sm font-medium hover:bg-primary/10"
                  >
                    <Icon name="message-square" className="w-4 h-4" />
                    Chat now
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskDaedalusCreateTools?.(uniqueNames[0])}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
                  >
                    <Icon name="hammer" className="w-4 h-4" />
                    Create tools
                  </button>
                </div>
              </motion.div>
            )}

            {/* Footer */}
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
