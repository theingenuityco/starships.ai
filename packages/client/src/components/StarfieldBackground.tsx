'use client'

import React, { useRef, useEffect, useState } from 'react'
import { motion } from 'motion/react'

interface Star {
  x: number
  y: number
  z: number
  prevX?: number
  prevY?: number
  size: number
  speed: number
  brightness: number
  twinkleSpeed: number
  twinkleOffset: number
  color: string
  id: number
  isActive: boolean
}

interface StarfieldBackgroundProps {
  density?: number
  speed?: number
  launching?: boolean
}

export function StarfieldBackground({
  density = 150,
  speed = 0.5,
  launching = false,
}: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const animationRef = useRef<number>(0)
  const timeRef = useRef<number>(0)
  const starIdCounter = useRef<number>(0)
  const deadStars = useRef<Set<number>>(new Set())
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  })

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = dimensions.width
    canvas.height = dimensions.height

    // Star colors for more realistic appearance
    const starColors = [
      '#FFFFFF', // White
      '#FFE9C4', // Warm white
      '#C4E5FF', // Cool blue-white
      '#FFD4A3', // Yellow-white
      '#FFE0F0', // Pink-white
    ]

    // Initialize stars
    const initStars = () => {
      starsRef.current = []
      deadStars.current.clear()
      starIdCounter.current = 0
      for (let i = 0; i < density; i++) {
        starsRef.current.push({
          id: starIdCounter.current++,
          x: (Math.random() - 0.5) * dimensions.width * 2,
          y: (Math.random() - 0.5) * dimensions.height * 2,
          z: Math.random() * 800 + 200, // Stars start closer for better initial visibility
          size: Math.pow(Math.random(), 1.5) * 2 + 0.3, // Smaller, more refined stars
          speed: Math.random() * 0.5 + 0.1,
          brightness: Math.random() * 0.5 + 0.5, // Brighter stars
          twinkleSpeed: Math.random() * 0.03 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2,
          color: starColors[Math.floor(Math.random() * starColors.length)],
          isActive: true,
        })
      }
    }

    // Garbage collection for off-screen stars
    const garbageCollectStars = () => {
      const centerX = dimensions.width / 2
      const centerY = dimensions.height / 2
      const margin = 100 // Extra margin for smooth transitions

      starsRef.current = starsRef.current.filter(star => {
        const x = (star.x / star.z) * 400 + centerX
        const y = (star.y / star.z) * 400 + centerY

        // Mark stars as dead if they go off-screen or behind camera
        const isOffScreen =
          x < -margin ||
          x > dimensions.width + margin ||
          y < -margin ||
          y > dimensions.height + margin
        const isBehindCamera = star.z <= 0

        if (isOffScreen || isBehindCamera) {
          deadStars.current.add(star.id)
          star.isActive = false
          return false // Remove from active stars
        }

        return star.isActive
      })

      // Maintain star density by creating new stars
      const currentCount = starsRef.current.length
      const targetCount = Math.min(density, 800) // Cap max stars for performance

      for (let i = currentCount; i < targetCount; i++) {
        starsRef.current.push({
          id: starIdCounter.current++,
          x: (Math.random() - 0.5) * dimensions.width * 2,
          y: (Math.random() - 0.5) * dimensions.height * 2,
          z: Math.random() * 800 + 200,
          size: Math.pow(Math.random(), 1.5) * 2 + 0.3,
          speed: Math.random() * 0.5 + 0.1,
          brightness: Math.random() * 0.5 + 0.5,
          twinkleSpeed: Math.random() * 0.03 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2,
          color: starColors[Math.floor(Math.random() * starColors.length)],
          isActive: true,
        })
      }
    }

    if (starsRef.current.length === 0 || starsRef.current.length !== density) {
      initStars()
    }

    // Draw stars function
    const drawStars = (clearWithTrail = true) => {
      const centerX = dimensions.width / 2
      const centerY = dimensions.height / 2

      // Run garbage collection every 60 frames (~1 second at 60fps)
      if (clearWithTrail && Math.floor(timeRef.current * 60) % 60 === 0) {
        garbageCollectStars()
      }

      starsRef.current.forEach(star => {
        if (!star.isActive) return
        // Store previous position for trail effect
        star.prevX = (star.x / star.z) * 400 + centerX
        star.prevY = (star.y / star.z) * 400 + centerY

        // Move stars only if animating
        if (clearWithTrail) {
          star.z -= (launching ? speed * 15 : speed) * star.speed
        }

        // Mark star for garbage collection if it goes behind camera
        if (star.z <= 0) {
          star.isActive = false
          deadStars.current.add(star.id)
          return
        }

        // Calculate 3D projection with wider field of view
        const x = (star.x / star.z) * 400 + centerX
        const y = (star.y / star.z) * 400 + centerY

        // Calculate size based on distance
        const size = (1 - star.z / 1000) * star.size

        // Calculate twinkling effect
        const twinkle = clearWithTrail
          ? Math.sin(timeRef.current * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7
          : 1
        const opacity = (1 - star.z / 1000) * star.brightness * twinkle

        // Draw star trail when launching
        if (launching && star.prevX && star.prevY && star.z < 800 && clearWithTrail) {
          const gradient = ctx.createLinearGradient(star.prevX, star.prevY, x, y)
          gradient.addColorStop(0, `${star.color}00`)
          gradient.addColorStop(
            1,
            `${star.color}${Math.floor(opacity * 255)
              .toString(16)
              .padStart(2, '0')}`
          )

          ctx.strokeStyle = gradient
          ctx.lineWidth = size * 0.5
          ctx.beginPath()
          ctx.moveTo(star.prevX, star.prevY)
          ctx.lineTo(x, y)
          ctx.stroke()
        }

        // Draw star with glow effect
        ctx.globalAlpha = opacity

        // Outer glow
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2)
        glowGradient.addColorStop(0, star.color)
        glowGradient.addColorStop(0.4, `${star.color}88`)
        glowGradient.addColorStop(1, `${star.color}00`)

        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(x, y, size * 2, 0, Math.PI * 2)
        ctx.fill()

        // Star core
        ctx.fillStyle = star.color
        ctx.beginPath()
        ctx.arc(x, y, size * 0.5, 0, Math.PI * 2)
        ctx.fill()

        // Cross pattern for larger stars
        if (size > 1.2) {
          ctx.strokeStyle = star.color
          ctx.lineWidth = size * 0.15
          ctx.globalAlpha = opacity * 0.5

          // Horizontal line
          ctx.beginPath()
          ctx.moveTo(x - size * 1.2, y)
          ctx.lineTo(x + size * 1.2, y)
          ctx.stroke()

          // Vertical line
          ctx.beginPath()
          ctx.moveTo(x, y - size * 1.2)
          ctx.lineTo(x, y + size * 1.2)
          ctx.stroke()
        }

        // Reset global alpha
        ctx.globalAlpha = 1
      })
    }

    // Initial render - draw all stars immediately
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    drawStars(false) // Draw without movement

    // Animation loop
    const animate = () => {
      timeRef.current += 0.016 // Approximate 60fps

      // Clear canvas with subtle trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
      ctx.fillRect(0, 0, dimensions.width, dimensions.height)

      drawStars(true) // Draw with movement

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [dimensions, density, speed, launching])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />
      {launching && (
        <>
          {/* Speed lines effect */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 1, 1],
              scale: [0.8, 1.5, 2],
            }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="fixed inset-0 pointer-events-none"
            style={{
              zIndex: 1,
              background:
                'radial-gradient(circle at center, transparent 30%, rgba(59, 130, 246, 0.1) 50%, rgba(59, 130, 246, 0.3) 100%)',
            }}
          />

          {/* Energy burst effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              scale: [1, 1.2, 1.5],
            }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="fixed inset-0 pointer-events-none flex items-center justify-center"
            style={{ zIndex: 2 }}
          >
            <div className="w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          </motion.div>

          {/* Flash lines */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: [0, 1, 0] }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none"
            style={{ zIndex: 3, transform: 'translateY(-50%)' }}
          />
        </>
      )}
    </>
  )
}
