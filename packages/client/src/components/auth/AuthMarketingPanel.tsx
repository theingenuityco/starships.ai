'use client'

import Icon from '@/components/primitives/Icon'
import Image from 'next/image'
import { motion } from 'motion/react'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Animated gradient orbs background */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-primary/40 via-purple-500/40 to-pink-500/40 rounded-full blur-3xl"
        animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-blue-500/40 via-primary/40 to-cyan-500/40 rounded-full blur-3xl"
        animate={{ scale: [1, 1.3, 1], x: [0, -40, 0], y: [0, -50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="absolute top-1/2 left-1/3 w-72 h-72 bg-gradient-to-br from-violet-500/30 via-fuchsia-500/30 to-primary/30 rounded-full blur-3xl"
        animate={{ scale: [1, 1.1, 1], x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Overlay gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/60" />

      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col justify-center px-10 xl:px-16 text-white">
        {/* Logo + small tagline */}
        <div className="mb-8 flex items-center gap-3 opacity-90">
          <Icon name="rocket" className="h-6 w-6 text-primary" />
          <span className="text-sm text-gray-300">Starships.ai</span>
        </div>

        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.1 }}>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white via-primary to-purple-300 bg-clip-text text-transparent">
            Turn ideas into intelligent workflows
          </h1>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed max-w-2xl">
            Design, deploy, and monitor AI agents with complete visibility and control.
          </p>

          {/* Benefits list */}
          <div className="space-y-4">
            <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="rocket-launch" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Rapid agent development & deployment</span>
            </motion.div>
            <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.45 }}>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="wrench" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Pre-built tools & customization</span>
            </motion.div>
            <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="store" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Marketplace of agents & tools</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Trust row */}
        <div className="mt-10 flex items-center gap-6 opacity-80">
          <span className="text-xs text-gray-400">Trusted by teams building with</span>
          <div className="flex items-center gap-6">
            {/* Placeholder logo marks; replace images with real logos if desired */}
            <div className="h-5 w-20 rounded bg-white/10" />
            <div className="h-5 w-16 rounded bg-white/10" />
            <div className="h-5 w-24 rounded bg-white/10" />
          </div>
        </div>

        {/* Mini testimonial card */}
        <div className="mt-8 max-w-lg rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-sm text-gray-200">
            “Starships streamlined our agent workflows and gave us the observability we were missing.”
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-white/20" />
            <div className="text-xs">
              <div className="text-white/90">Head of Platform</div>
              <div className="text-white/60">GrowthCo</div>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-10 text-xs text-white/60">
          <a className="hover:text-white/80" href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
          <span className="mx-2">•</span>
          <a className="hover:text-white/80" href="/terms" target="_blank" rel="noreferrer">Terms</a>
        </div>
      </div>
    </div>
  )
}

export default AuthMarketingPanel


