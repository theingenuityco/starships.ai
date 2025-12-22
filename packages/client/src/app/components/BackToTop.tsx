'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import Icon from '@/components/primitives/Icon'

export default function BackToTop() {
  const [isFlying, setIsFlying] = useState(false)
  const [rocketPosition, setRocketPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    }
  }, [])

  const scrollToTop = () => {
    // Get button position for rocket start point
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setRocketPosition({
        x: rect.left + 12, // Offset to center of icon
        y: rect.top + 12,
      })
    }

    // Start flying animation
    setIsFlying(true)

    // Scroll to top smoothly
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    // Reset flying state after animation completes
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    resetTimeoutRef.current = setTimeout(() => {
      setIsFlying(false)
    }, 1200)
  }

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={scrollToTop}
        className="relative px-3 py-2 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 shadow-sm hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all duration-200 flex items-center gap-2 group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
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

        <span className="text-xs font-normal text-white/60 group-hover:text-white/90 whitespace-nowrap transition-colors">Top</span>
      </motion.button>

      {/* Flying rocket - rendered at document level with fixed positioning */}
      {isFlying && (
        <motion.div
          className="fixed pointer-events-none"
          style={{
            left: rocketPosition.x,
            top: rocketPosition.y,
            zIndex: 9999,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -1000,
            opacity: [1, 1, 1, 0],
            rotate: [0, -10, 10, -5, 5, 0],
          }}
          transition={{ duration: 1.2, ease: 'easeIn' }}
        >
          <Icon name="rocket" className="w-5 h-5 text-white" />
          
          {/* Flame trail */}
          <motion.div
            className="absolute top-5 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              height: [0, 30, 50, 70],
            }}
            transition={{ duration: 1.2, ease: 'linear' }}
          >
            <div className="w-4 h-full bg-gradient-to-b from-orange-400 via-red-400 to-transparent blur-sm" />
          </motion.div>
        </motion.div>
      )}
    </>
  )
}

