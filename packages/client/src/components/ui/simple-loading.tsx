'use client'

import { cn } from '@/lib/utils'

/**
 * Simple Loading Components
 * 
 * Replaces the complex 345-line loading-states.tsx with 3 focused components
 * that cover all the actual use cases in the application.
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: React.ReactNode
}

/**
 * Vibrating rocket loading indicator
 * Covers 90% of loading state use cases with style ✨
 */
export function LoadingSpinner({ size = 'md', className, children }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl', 
    lg: 'text-4xl'
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div 
        className={cn('animate-pulse', sizeClasses[size])}
        style={{
          animation: 'bounce 1s ease-in-out infinite, vibrate 0.3s ease-in-out infinite'
        }}
      >
        🚀
      </div>
      {children && <span className="text-muted-foreground">{children}</span>}
      <style jsx global>{`
        @keyframes vibrate {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-0.5px) rotate(-0.5deg); }
          75% { transform: translateX(0.5px) rotate(0.5deg); }
        }
      `}</style>
    </div>
  )
}

interface LoadingOverlayProps {
  isLoading: boolean
  children: React.ReactNode
  message?: string
  className?: string
}

/**
 * Loading overlay for forms and content areas
 * Replaces LoadingOverlay from complex system
 */
export function LoadingOverlay({ isLoading, children, message = 'Loading...', className }: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <LoadingSpinner size="lg">{message}</LoadingSpinner>
        </div>
      )}
    </div>
  )
}

interface AuthLoadingScreenProps {
  message?: string
}

/**
 * Full-screen loading state for authentication pages
 * Replaces AuthLoadingState from complex system
 */
export function AuthLoadingScreen({ message = 'Loading...' }: AuthLoadingScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner size="lg">{message}</LoadingSpinner>
    </div>
  )
}