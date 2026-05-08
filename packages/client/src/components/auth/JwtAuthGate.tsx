'use client'

import Icon from '@/components/primitives/Icon'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'motion/react'
import { LoginForm } from '@/components/auth/LoginForm'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

interface JwtAuthGateProps {
  children: React.ReactNode
}

/**
 * JWT Authentication gate component
 * Shows login UI for unauthenticated users, or renders children for authenticated users
 */
export function JwtAuthGate({ children }: JwtAuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const setupChecked = useRef(false)

  // On first unauthenticated render, check if first-time setup is required.
  // Retries on server errors to handle the startup window before DB migrations finish.
  useEffect(() => {
    if (isAuthenticated || isLoading || setupChecked.current) return
    setupChecked.current = true

    let cancelled = false
    const check = async (attempts = 0) => {
      try {
        const r = await fetch('/api/v1/setup/status')
        if (!r.ok) throw new Error('not ready')
        const json = await r.json()
        if (!cancelled && json.data?.setupRequired) {
          router.replace('/setup')
        }
      } catch {
        if (!cancelled && attempts < 5) {
          setTimeout(() => check(attempts + 1), 1000)
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center space-y-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Icon name="rocket" className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-muted-foreground">Initializing starship systems...</p>
        </motion.div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center space-y-6 text-center max-w-md" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <motion.div className="flex items-center space-x-2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}>
            <Icon name="star" className="h-8 w-8 text-primary" />
            <Icon name="rocket" className="h-10 w-10 text-primary" />
            <Icon name="zap" className="h-8 w-8 text-primary" />
          </motion.div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Starships.ai</h1>
          </div>
          <LoginForm />
        </motion.div>
      </div>
    )
  }

  return <>{children}</>
}
