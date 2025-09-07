'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { EnhancedError, ErrorRecoveryManager } from '@/lib/error-recovery'
import { AlertTriangle, Bug, RefreshCw } from 'lucide-react'
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
  component?: string
}

interface State {
  hasError: boolean
  error: EnhancedError | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

export class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error: ErrorRecoveryManager.enhanceError(error, ErrorRecoveryManager.createContext('render', 'ErrorBoundary'), []),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const enhanced = ErrorRecoveryManager.enhanceError(
      error,
      ErrorRecoveryManager.createContext('render', this.props.component || 'ErrorBoundary', {
        componentStack: errorInfo.componentStack,
      })
    )

    this.setState({
      error: enhanced,
      errorInfo,
    })

    // Log error
    ErrorRecoveryManager.logError(enhanced)

    // Call custom error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }))
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReportIssue = () => {
    const error = this.state.error
    if (!error) return

    const issueData = {
      error: error.message,
      stack: error.stack,
      component: this.props.component,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    // In a real app, this would open a support form or send to error tracking
    console.log('Report issue:', issueData)

    // For now, copy to clipboard
    navigator.clipboard?.writeText(JSON.stringify(issueData, null, 2))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const error = this.state.error
      const canRetry = this.state.retryCount < this.maxRetries
      const userMessage = error ? ErrorRecoveryManager.getUserFriendlyMessage(error) : 'Something went wrong'
      const guidance = error ? ErrorRecoveryManager.getRecoveryGuidance(error) : ''

      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="w-full max-w-lg border-destructive/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-destructive">Something went wrong</CardTitle>
              <CardDescription className="text-center">{userMessage}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {guidance && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm text-muted-foreground">{guidance}</p>
                </div>
              )}

              {error?.category && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {error.category}
                  </Badge>
                  {error.severity && (
                    <Badge variant={error.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                      {error.severity}
                    </Badge>
                  )}
                </div>
              )}

              {this.props.showDetails && error && (
                <details className="rounded-lg border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Technical Details</summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
                      <strong>Error:</strong> {error.message}
                    </div>
                    {error.context?.metadata?.timestamp && (
                      <div>
                        <strong>Time:</strong> {error.context.metadata.timestamp.toLocaleString()}
                      </div>
                    )}
                    {error.context?.location && (
                      <div>
                        <strong>Location:</strong> {error.context.location}
                      </div>
                    )}
                    {this.state.retryCount > 0 && (
                      <div>
                        <strong>Retry Count:</strong> {this.state.retryCount}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2">
              <div className="flex w-full gap-2">
                {canRetry && (
                  <Button onClick={this.handleRetry} className="flex-1">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                )}
                <Button onClick={this.handleReload} variant="outline" className="flex-1">
                  Reload Page
                </Button>
              </div>

              <div className="flex w-full gap-2">
                <Button onClick={this.handleReset} variant="ghost" size="sm" className="flex-1">
                  Reset Component
                </Button>
                <Button onClick={this.handleReportIssue} variant="ghost" size="sm" className="flex-1">
                  <Bug className="mr-2 h-4 w-4" />
                  Report Issue
                </Button>
              </div>

              {!canRetry && <p className="text-xs text-muted-foreground text-center">Maximum retry attempts reached. Please reload the page or contact support.</p>}
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, errorBoundaryProps?: Omit<Props, 'children'>) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

/**
 * Hook for handling errors in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<EnhancedError | null>(null)

  const handleError = React.useCallback((error: Error, context?: string) => {
    const enhanced = ErrorRecoveryManager.enhanceError(error, ErrorRecoveryManager.createContext('hook', context || 'useErrorHandler'))

    ErrorRecoveryManager.logError(enhanced)
    setError(enhanced)
  }, [])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  const retry = React.useCallback(
    (operation: () => void | Promise<void>) => {
      clearError()
      try {
        const result = operation()
        if (result instanceof Promise) {
          result.catch(handleError)
        }
      } catch (err) {
        handleError(err as Error)
      }
    },
    [handleError, clearError]
  )

  return {
    error,
    hasError: !!error,
    handleError,
    clearError,
    retry,
  }
}
