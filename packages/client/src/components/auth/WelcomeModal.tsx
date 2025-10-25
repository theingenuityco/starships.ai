'use client'

import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { motion, useAnimate } from 'motion/react'
import confetti from 'canvas-confetti'

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
  userName?: string
  walletBalance?: number
  onViewBalance?: () => void
}

export function WelcomeModal({ open, onClose, userName, walletBalance = 10 }: WelcomeModalProps) {
  const [mounted, setMounted] = useState(false)
  const [scope, animate] = useAnimate()

  useEffect(() => {
    setMounted(true)
  }, [])

  const triggerConfetti = useCallback(() => {
    if (typeof window === 'undefined') return

    const count = 200
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 10000,
    }

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
      setTimeout(() => triggerConfetti(), 600)
    }
  }, [open, mounted, triggerConfetti])

  if (!mounted) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0 border-0 bg-transparent shadow-none overflow-visible">
        <motion.div
          ref={scope}
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.6 }}
          className="relative bg-background border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Animated gradient background */}
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

          {/* Content */}
          <div className="relative p-10">
            {/* Header with icon */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                className="relative inline-block mb-6"
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ delay: 0.8, duration: 0.6, ease: 'easeInOut' }}
                  className="relative"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur-xl -z-10"
                  />
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <DialogTitle className="text-3xl font-bold mb-3 bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                  {userName ? `Welcome, ${userName.split(' ')[0]}!` : 'Welcome aboard!'}
                </DialogTitle>
                <p className="text-base text-muted-foreground">
                  Your Starship journey begins now
                </p>
              </motion.div>
            </div>

            {/* Balance Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-8"
            >
              <div className="relative rounded-2xl border border-border/50 overflow-hidden bg-gradient-to-br from-background to-muted/30">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent" />

                <div className="relative p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center border border-emerald-500/20"
                      >
                        <Icon name="wallet" className="w-5 h-5 text-emerald-600 dark:text-emerald-400" weight="fill" />
                      </motion.div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Welcome Credit</p>
                        <p className="text-xs text-muted-foreground/70">Added to your account</p>
                      </div>
                    </div>
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Credited</span>
                    </motion.div>
                  </div>

                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
                    className="mb-4"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-6xl font-bold tracking-tight tabular-nums bg-gradient-to-br from-foreground to-foreground/80 bg-clip-text text-transparent">
                        ${walletBalance}
                      </span>
                      <span className="text-3xl text-muted-foreground font-semibold">.00</span>
                    </div>
                  </motion.div>

                  <p className="text-sm text-muted-foreground">
                    Start building AI agents, workflows, and automation
                  </p>
                </div>
              </div>
            </motion.div>          

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
            >
              <Button
                onClick={onClose}
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
                size="lg"
              >
                <Icon name="rocket" className="w-5 h-5 mr-2" weight="fill" />
                Start Building
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
