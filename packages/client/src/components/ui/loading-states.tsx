'use client'

import React from 'react'
import { Loader2, CheckCircle, AlertCircle, Clock, Wifi, Key } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'
import { Badge } from './badge'
import { Progress } from './progress'
import { Skeleton } from './skeleton'

export interface LoadingStateProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'spinner' | 'pulse' | 'skeleton' | 'progress'
  message?: string
  description?: string
  progress?: number
  showIcon?: boolean
}

/**
 * Generic loading spinner component
 */
export function LoadingSpinner({
  className,
  size = 'md',
  message,
  showIcon = true,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showIcon && <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />}
      {message && (
        <span
          className={cn(
            'text-muted-foreground',
            size === 'sm' && 'text-sm',
            size === 'lg' && 'text-lg'
          )}
        >
          {message}
        </span>
      )}
    </div>
  )
}

/**
 * Loading state with progress bar
 */
export function LoadingProgress({
  className,
  message,
  description,
  progress = 0,
}: LoadingStateProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {message && <span className="text-sm font-medium">{message}</span>}
      </div>

      <Progress value={progress} className="h-2" />

      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <div className="text-right">
        <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
      </div>
    </div>
  )
}

/**
 * Skeleton loading for API key forms
 */
export function ApiKeyFormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex gap-2 pt-4">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}

/**
 * Skeleton loading for connector list
 */
export function ConnectorListSkeleton({
  count = 3,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 rounded-lg border p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  )
}

/**
 * Loading state for API key validation
 */
export function ApiKeyValidationLoading({
  keyName,
  className,
}: {
  keyName: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Validating {keyName}...</span>
    </div>
  )
}

/**
 * Connection status indicator with loading states
 */
export interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'validating'
  message?: string
  className?: string
  showLabel?: boolean
}

export function ConnectionStatus({
  status,
  message,
  className,
  showLabel = true,
}: ConnectionStatusProps) {
  const statusConfig = {
    connecting: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      label: 'Connecting...',
      badgeVariant: 'secondary' as const,
      color: 'text-blue-600',
    },
    connected: {
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      label: 'Connected',
      badgeVariant: 'default' as const,
      color: 'text-green-600',
    },
    disconnected: {
      icon: <Wifi className="h-4 w-4 text-gray-400" />,
      label: 'Disconnected',
      badgeVariant: 'outline' as const,
      color: 'text-gray-500',
    },
    error: {
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      label: 'Error',
      badgeVariant: 'destructive' as const,
      color: 'text-red-600',
    },
    validating: {
      icon: <Key className="h-4 w-4 animate-pulse text-amber-500" />,
      label: 'Validating...',
      badgeVariant: 'secondary' as const,
      color: 'text-amber-600',
    },
  }

  const config = statusConfig[status]

  if (!showLabel) {
    return (
      <div className={cn('flex items-center', className)} title={message || config.label}>
        {config.icon}
      </div>
    )
  }

  return (
    <Badge variant={config.badgeVariant} className={cn('flex items-center gap-1.5', className)}>
      {config.icon}
      <span className="text-xs">{message || config.label}</span>
    </Badge>
  )
}

/**
 * Multi-step loading indicator
 */
export interface LoadingStep {
  id: string
  label: string
  status: 'pending' | 'loading' | 'completed' | 'error'
  description?: string
}

export interface MultiStepLoadingProps {
  steps: LoadingStep[]
  currentStep?: string
  className?: string
}

export function MultiStepLoading({ steps, currentStep, className }: MultiStepLoadingProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = step.status === 'completed'
        const isError = step.status === 'error'
        const isLoading = step.status === 'loading'

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-3 rounded-lg p-3 transition-colors',
              isActive && 'bg-primary/5 border border-primary/20',
              isCompleted && 'bg-green-50 dark:bg-green-900/10',
              isError && 'bg-red-50 dark:bg-red-900/10'
            )}
          >
            <div className="flex-shrink-0">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {isCompleted && <CheckCircle className="h-4 w-4 text-green-500" />}
              {isError && <AlertCircle className="h-4 w-4 text-red-500" />}
              {step.status === 'pending' && (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-sm font-medium',
                  isActive && 'text-primary',
                  isCompleted && 'text-green-700 dark:text-green-300',
                  isError && 'text-red-700 dark:text-red-300',
                  step.status === 'pending' && 'text-muted-foreground'
                )}
              >
                {step.label}
              </div>
              {step.description && (
                <div className="text-xs text-muted-foreground mt-1">{step.description}</div>
              )}
            </div>

            <div className="flex-shrink-0">
              <Badge
                variant={
                  isCompleted
                    ? 'default'
                    : isError
                      ? 'destructive'
                      : isLoading
                        ? 'secondary'
                        : 'outline'
                }
                className="text-xs"
              >
                {isCompleted ? 'Done' : isError ? 'Failed' : isLoading ? 'Loading' : 'Pending'}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Loading overlay for forms and modals
 */
export interface LoadingOverlayProps {
  isLoading: boolean
  message?: string
  description?: string
  progress?: number
  children: React.ReactNode
  className?: string
}

export function LoadingOverlay({
  isLoading,
  message = 'Loading...',
  description,
  progress,
  children,
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <CardTitle className="text-lg">{message}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>

            {typeof progress === 'number' && (
              <CardContent>
                <div className="space-y-2">
                  <Progress value={progress} className="h-2" />
                  <div className="text-center text-xs text-muted-foreground">
                    {Math.round(progress)}% complete
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

/**
 * Inline loading state for buttons and small components
 */
export function InlineLoading({
  message,
  size = 'sm',
  className,
}: {
  message?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
  }

  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size])} />
      {message && (
        <span className={cn('text-muted-foreground', textSizeClasses[size])}>{message}</span>
      )}
    </div>
  )
}
