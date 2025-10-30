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
          className="fixed bottom-8 right-8 z-50 px-4 py-3 rounded-2xl bg-gradient-to-br from-primary/90 to-purple-600/90 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2 group"
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
                    y: [0, -4, 0],
                    transition: {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }
            }
          >
            <Icon name="rocket" className="w-5 h-5 text-white" />
          </motion.div>
          <span className="text-sm font-medium text-white whitespace-nowrap">Back to Top</span>

          {/* Exhaust/flame effect */}
          {isFlying && (
            <motion.div
              className="absolute bottom-0 left-6 transform -translate-x-1/2"
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                height: [0, 20, 40, 60],
                scaleX: [1, 1.2, 1, 0.8],
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              <div className="w-4 h-full bg-gradient-to-b from-orange-400 via-red-400 to-transparent blur-sm" />
            </motion.div>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}

