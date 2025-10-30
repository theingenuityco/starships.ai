'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import Icon from '@/components/primitives/Icon'

export default function BackToTop() {
  const [isFlying, setIsFlying] = useState(false)

  const scrollToTop = () => {
    // Start flying animation
    setIsFlying(true)

    // Scroll to top smoothly
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    // Reset flying state after animation completes
    setTimeout(() => {
      setIsFlying(false)
    }, 1000)
  }

  return (
    <div className="relative z-[100]" style={{ overflow: 'visible' }}>
      <motion.button
        onClick={scrollToTop}
        className="relative px-3 py-2 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 shadow-sm hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all duration-200 flex items-center gap-2 group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        style={{ overflow: 'visible' }}
      >
          <div className="relative w-4 h-4" style={{ overflow: 'visible' }}>
            {/* Arrow (default state) */}
            {!isFlying && (
              <motion.div
                animate={{
                  y: [0, -3, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Icon name="arrow-up" className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
              </motion.div>
            )}

            {/* Rocket (flying state) */}
            {isFlying && (
              <motion.div
                className="absolute top-0 left-0 z-[200]"
                initial={{ y: 0 }}
                animate={{
                  y: -1000,
                  rotate: [0, -10, 10, -5, 5, 0],
                }}
                transition={{ duration: 1, ease: 'easeIn' }}
              >
                <Icon name="rocket" className="w-4 h-4 text-white" />
              </motion.div>
            )}
          </div>

          <span className="text-xs font-normal text-white/60 group-hover:text-white/90 whitespace-nowrap transition-colors">Top</span>

          {/* Exhaust/flame effect for rocket */}
          {isFlying && (
            <motion.div
              className="absolute top-4 left-3 pointer-events-none z-[150]"
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                height: [0, 20, 40, 60],
                scaleX: [1, 1.2, 1, 0.8],
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              <div className="w-3 h-full bg-gradient-to-b from-orange-400 via-red-400 to-transparent blur-sm" />
            </motion.div>
          )}
      </motion.button>
    </div>
  )
}

