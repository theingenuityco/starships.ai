'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Icon from '@/components/primitives/Icon'

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false)
  const [isFlying, setIsFlying] = useState(false)

  // Show button when page is scrolled down
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

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
    <AnimatePresence>
      {isVisible && (
        <motion.button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 px-3 py-2 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 shadow-sm hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all duration-200 flex items-center gap-2 group"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={
            isFlying
              ? {
                  opacity: 0,
                  scale: 0.5,
                  y: -1000,
                  transition: { duration: 1, ease: 'easeIn' },
                }
              : {
                  opacity: 1,
                  scale: 1,
                  y: 0,
                }
          }
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={
              isFlying
                ? {
                    y: -1000,
                    rotate: [0, -10, 10, -5, 5, 0],
                    transition: { duration: 1, ease: 'easeIn' },
                  }
                : {
                    y: [0, -3, 0],
                    transition: {
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }
            }
          >
            <Icon name="arrow-up" className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
          </motion.div>
          <span className="text-xs font-normal text-white/60 group-hover:text-white/90 whitespace-nowrap transition-colors">Top</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

