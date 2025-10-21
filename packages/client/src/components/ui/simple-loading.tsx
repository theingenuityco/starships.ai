'use client'

import { cn } from '@/lib/utils'
import LoadingIcon from '@/components/primitives/LoadingSpinner'

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
 * Basic loading spinner with optional text
 * Covers 90% of loading state use cases
 */
export function LoadingSpinner({ size = 'md', className, children }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8'
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LoadingIcon className={cn('text-primary', sizeClasses[size])} />
      {children && <span className="text-muted-foreground">{children}</span>}
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