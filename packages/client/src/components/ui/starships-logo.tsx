'use client'

import { motion } from 'motion/react'

interface StarshipsLogoProps {
  width?: number
  height?: number
  className?: string
  gradientId?: string
  animationDelay?: number
  repeatDelay?: number
  triggerAnimation?: number
}

export function StarshipsLogo({ width = 20, height = 20, className = '', gradientId = 'starships-logo-gradient', animationDelay = 1, repeatDelay = 8, triggerAnimation = 0 }: StarshipsLogoProps) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        <motion.linearGradient
          id={gradientId}
          x1="0%"
          y1="75%"
          x2="100%"
          y2="0%"
          key={triggerAnimation}
          animate={{
            x1: ['-150%', '150%'],
            x2: ['-50%', '250%'],
            y1: ['150%', '-50%'],
            y2: ['100%', '-100%'],
          }}
          transition={{
            duration: 2,
            repeat: triggerAnimation > 0 ? 0 : Infinity,
            ease: 'easeInOut',
            repeatDelay: triggerAnimation > 0 ? 0 : repeatDelay,
            delay: triggerAnimation > 0 ? 0 : animationDelay,
          }}
        >
          <stop offset="0%" stopColor="hsl(var(--foreground) / 0.9)" />
          <stop offset="12%" stopColor="hsl(var(--foreground) / 0.95)" />
          <stop offset="15%" stopColor="hsl(var(--foreground))" />
          <stop offset="18%" stopColor="hsl(var(--foreground) / 0.8)" />
          <stop offset="20%" stopColor="hsl(var(--foreground) / 0.5)" />
          <stop offset="22%" stopColor="hsl(var(--foreground) / 0.2)" />
          <stop offset="25%" stopColor="hsl(var(--background) / 0.01)" />
          <stop offset="30%" stopColor="hsl(var(--background) / 0.05)" />
          <stop offset="35%" stopColor="hsl(var(--background) / 0.08)" />
          <stop offset="50%" stopColor="hsl(var(--background) / 0.1)" />
          <stop offset="65%" stopColor="hsl(var(--background) / 0.08)" />
          <stop offset="70%" stopColor="hsl(var(--background) / 0.05)" />
          <stop offset="75%" stopColor="hsl(var(--background) / 0.01)" />
          <stop offset="78%" stopColor="hsl(var(--foreground) / 0.2)" />
          <stop offset="80%" stopColor="hsl(var(--foreground) / 0.5)" />
          <stop offset="82%" stopColor="hsl(var(--foreground) / 0.8)" />
          <stop offset="85%" stopColor="hsl(var(--foreground))" />
          <stop offset="88%" stopColor="hsl(var(--foreground) / 0.95)" />
          <stop offset="100%" stopColor="hsl(var(--foreground) / 0.9)" />
        </motion.linearGradient>
      </defs>
      <motion.path
        d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
        key={`path1-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: triggerAnimation > 0 ? 0.1 : animationDelay * 0.2 }}
      />
      <motion.path
        d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"
        key={`path2-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: triggerAnimation > 0 ? 0.2 : animationDelay * 0.3 }}
      />
      <motion.path
        d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
        key={`path3-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: triggerAnimation > 0 ? 0.3 : animationDelay * 0.4 }}
      />
      <motion.circle
        cx="14.5"
        cy="9"
        r="1.5"
        fill="none"
        strokeLinecap="butt"
        key={`circle-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1.2 }}
        transition={{ duration: 0.2, delay: triggerAnimation > 0 ? 0.4 : animationDelay * 0.5 }}
      />
      {/* Three parallel flame lines representing thrust with varied lengths */}
      <motion.line
        x1="6"
        y1="15"
        x2="2.5"
        y2="18.5"
        key={`line1-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: triggerAnimation > 0 ? 0.5 : animationDelay * 0.6 }}
      />
      <motion.line
        x1="7.5"
        y1="16.5"
        x2="5.4"
        y2="18.6"
        key={`line2-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: triggerAnimation > 0 ? 0.6 : animationDelay * 0.7 }}
      />
      <motion.line
        x1="9"
        y1="18"
        x2="7.6"
        y2="19.4"
        key={`line3-${triggerAnimation}`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: triggerAnimation > 0 ? 0.7 : animationDelay * 0.8 }}
      />
    </motion.svg>
  )
}
