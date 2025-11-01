import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { motion, useAnimate } from 'motion/react'
import confetti from 'canvas-confetti'
import Icon from '@/components/primitives/Icon'
import { DeployedAgentCard } from '@/components/agents/DeployedAgentCard'
import type { AgentModel } from '@starships/protocol'

interface AgentCreatedModalProps {
  open: boolean
  names: string[]
  onOpenChange: (open: boolean) => void
  onChatWithAgent?: (agentName: string) => void
  onAskDaedalusCreateTools?: (agentName: string) => void
  agents?: AgentModel[]
}

export function AgentCreatedModal({ open, names, onOpenChange, onChatWithAgent, onAskDaedalusCreateTools, agents }: AgentCreatedModalProps) {
  const uniqueNames = Array.isArray(names) ? Array.from(new Set(names.filter(n => typeof n === 'string' && n.trim()))).slice(0, 10) : []
  const baseTitle = useMemo(() => {
    if (uniqueNames.length > 1) return `You created ${uniqueNames.length} agents`
    const single = (uniqueNames[0] || '').trim()
    return single ? `You created ${single}` : 'You created an agent'
  }, [uniqueNames])
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
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 border-0 shadow-none bg-transparent overflow-visible outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 rounded-3xl sm:rounded-3xl">
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
                  <span className="mr-2 align-[-2px]" aria-hidden>🎉</span>
                  <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">{baseTitle}</span>
                </DialogTitle>
              </DialogHeader>
            </div>

            {/* Agents Cards (preferred) or fallback list */}
            {Array.isArray(agents) && agents.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 mb-6">
                {agents.map((a, idx) => (
                  <motion.div key={a.id || a.slug || a.name || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + idx * 0.04 }}>
                    <DeployedAgentCard
                      agent={a as AgentModel}
                      onClick={() => onChatWithAgent?.(a.name)}
                      onChat={() => onChatWithAgent?.(a.name)}
                      showActions={false}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              uniqueNames.length > 0 && (
                <div className="grid grid-cols-1 gap-3 mb-6">
                  {uniqueNames.map((name, idx) => (
                    <motion.div key={name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + idx * 0.04 }}>
                      <DeployedAgentCard
                        agent={{ id: `temp-${name}-${idx}`, name, description: 'Draft agent is ready', model: 'N/A', slug: undefined } as unknown as AgentModel}
                        onClick={() => onChatWithAgent?.(name)}
                        onChat={() => onChatWithAgent?.(name)}
                        showActions={false}
                      />
                    </motion.div>
                  ))}
                </div>
              )
            )}

            {/* Bottom CTAs */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onChatWithAgent?.((agents && agents[0]?.name) || uniqueNames[0])}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/50 px-4 py-2.5 text-sm font-medium hover:bg-primary/10"
                >
                  <Icon name="message-square" className="w-4 h-4" />
                  Chat now
                </button>
                <button
                  type="button"
                  onClick={() => onAskDaedalusCreateTools?.((agents && agents[0]?.name) || uniqueNames[0])}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
                >
                  <Icon name="hammer" className="w-4 h-4" />
                  Create tools
                </button>
              </div>
            </motion.div>

            {/* Footer removed per design */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
