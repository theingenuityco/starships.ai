/**
 * Error Recovery Utilities for API Key Management
 * Provides comprehensive error handling, retry mechanisms, and user guidance
 */

export interface ErrorRecoveryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  backoffFactor?: number
  retryableErrors?: string[]
}

export interface RecoveryAction {
  id: string
  label: string
  description: string
  action: () => Promise<void> | void
  primary?: boolean
  destructive?: boolean
}

export interface ErrorContext {
  operation: string
  component: string
  timestamp: Date
  userAgent?: string
  additionalData?: Record<string, any>
}

export interface EnhancedError extends Error {
  code?: string
  category?: 'network' | 'validation' | 'authentication' | 'permission' | 'server' | 'client'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  recoverable?: boolean
  retryable?: boolean
  context?: ErrorContext
  originalError?: Error
  recoveryActions?: RecoveryAction[]
}

export class ErrorRecoveryManager {
  private static readonly DEFAULT_OPTIONS: Required<ErrorRecoveryOptions> = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    retryableErrors: [
      'NetworkError',
      'TimeoutError',
      'ServiceUnavailable',
      'InternalServerError',
      'BadGateway',
      'GatewayTimeout',
    ],
  }

  /**
   * Enhanced error with recovery context and actions
   */
  static enhanceError(
    error: Error,
    context: ErrorContext,
    recoveryActions?: RecoveryAction[]
  ): EnhancedError {
    const enhanced = error as EnhancedError
    enhanced.context = context
    enhanced.recoveryActions = recoveryActions || []

    // Categorize error
    enhanced.category = this.categorizeError(error)
    enhanced.severity = this.determineSeverity(error, context)
    enhanced.recoverable = this.isRecoverable(error)
    enhanced.retryable = this.isRetryable(error)

    // Generate recovery actions if not provided
    if (!recoveryActions) {
      enhanced.recoveryActions = this.generateRecoveryActions(enhanced)
    }

    return enhanced
  }

  /**
   * Retry mechanism with exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: ErrorRecoveryOptions = {}
  ): Promise<T> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    let lastError: Error

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // Don't retry on last attempt or non-retryable errors
        if (attempt === opts.maxRetries || !this.isRetryable(error as Error)) {
          throw error
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffFactor, attempt),
          opts.maxDelay
        )

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000

        await this.sleep(jitteredDelay)
      }
    }

    throw lastError!
  }

  /**
   * Categorize error type
   */
  private static categorizeError(error: Error): EnhancedError['category'] {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()

    if (name.includes('network') || message.includes('network') || message.includes('fetch')) {
      return 'network'
    }

    if (
      name.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return 'validation'
    }

    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('auth')
    ) {
      return 'authentication'
    }

    if (message.includes('permission') || message.includes('access denied')) {
      return 'permission'
    }

    if (message.includes('server error') || message.includes('internal server')) {
      return 'server'
    }

    return 'client'
  }

  /**
   * Determine error severity
   */
  private static determineSeverity(error: Error, context: ErrorContext): EnhancedError['severity'] {
    const category = this.categorizeError(error)

    switch (category) {
      case 'network':
        return context.operation.includes('save') || context.operation.includes('submit')
          ? 'high'
          : 'medium'
      case 'validation':
        return 'low'
      case 'authentication':
      case 'permission':
        return 'high'
      case 'server':
        return 'critical'
      default:
        return 'medium'
    }
  }

  /**
   * Check if error is recoverable
   */
  private static isRecoverable(error: Error): boolean {
    const category = this.categorizeError(error)
    const message = error.message.toLowerCase()

    // Non-recoverable errors
    if (message.includes('forbidden') || message.includes('unauthorized')) {
      return false
    }

    // Most errors are recoverable with user action
    return true
  }

  /**
   * Check if error is retryable
   */
  private static isRetryable(error: Error): boolean {
    const name = error.name
    const message = error.message.toLowerCase()

    // Check against retryable error patterns
    const retryablePatterns = [
      'network',
      'timeout',
      'service unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
      'connection',
      'fetch',
    ]

    return retryablePatterns.some(
      pattern => name.toLowerCase().includes(pattern) || message.includes(pattern)
    )
  }

  /**
   * Generate contextual recovery actions
   */
  private static generateRecoveryActions(error: EnhancedError): RecoveryAction[] {
    const actions: RecoveryAction[] = []

    switch (error.category) {
      case 'network':
        actions.push(
          {
            id: 'retry',
            label: 'Try Again',
            description: 'Retry the operation',
            action: () => {}, // Will be replaced by caller
            primary: true,
          },
          {
            id: 'check-connection',
            label: 'Check Connection',
            description: 'Verify your internet connection',
            action: () => {
              window.open('https://www.google.com', '_blank')
            },
          }
        )
        break

      case 'validation':
        actions.push({
          id: 'fix-validation',
          label: 'Fix Input',
          description: 'Correct the highlighted fields',
          action: () => {}, // Will focus first invalid field
          primary: true,
        })
        break

      case 'authentication':
        actions.push(
          {
            id: 'refresh-auth',
            label: 'Refresh Authentication',
            description: 'Re-authenticate your session',
            action: () => {
              window.location.reload()
            },
            primary: true,
          },
          {
            id: 'get-help',
            label: 'Get Help',
            description: 'View authentication documentation',
            action: () => {}, // Will be replaced with help URL
          }
        )
        break

      case 'server':
        actions.push(
          {
            id: 'retry-later',
            label: 'Try Again Later',
            description: 'The service may be temporarily unavailable',
            action: () => {}, // Will be replaced by caller
            primary: true,
          },
          {
            id: 'report-issue',
            label: 'Report Issue',
            description: 'Report this problem to support',
            action: () => {}, // Will open support form
          }
        )
        break

      default:
        actions.push({
          id: 'retry',
          label: 'Try Again',
          description: 'Retry the operation',
          action: () => {},
          primary: true,
        })
    }

    return actions
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(error: EnhancedError): string {
    const category = error.category || 'client'
    const operation = error.context?.operation || 'operation'

    const messages: Record<string, string> = {
      network: `Unable to connect to the server. Please check your internet connection and try again.`,
      validation: `Please check the highlighted fields and correct any errors.`,
      authentication: `Your session has expired. Please refresh the page and try again.`,
      permission: `You don't have permission to perform this action. Please contact your administrator.`,
      server: `The server is experiencing issues. Please try again in a few moments.`,
      client: `Something went wrong while ${operation}. Please try again.`,
    }

    return messages[category] || messages.client
  }

  /**
   * Get recovery guidance text
   */
  static getRecoveryGuidance(error: EnhancedError): string {
    const category = error.category || 'client'

    const guidance: Record<string, string> = {
      network:
        'This usually happens when there are connectivity issues. Check your internet connection and try again.',
      validation:
        'Make sure all required fields are filled out correctly and match the expected format.',
      authentication:
        'Your login session may have expired. Refreshing the page should resolve this.',
      permission:
        'Contact your system administrator if you believe you should have access to this feature.',
      server: 'Our servers are experiencing temporary issues. Please wait a moment and try again.',
      client: 'This is usually a temporary issue. Trying again often resolves the problem.',
    }

    return guidance[category] || guidance.client
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Create error context
   */
  static createContext(
    operation: string,
    component: string,
    additionalData?: Record<string, any>
  ): ErrorContext {
    return {
      operation,
      component,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      additionalData,
    }
  }

  /**
   * Log error for debugging
   */
  static logError(error: EnhancedError): void {
    const logData = {
      message: error.message,
      category: error.category,
      severity: error.severity,
      context: error.context,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }

    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorRecovery]', logData)
    }

    // In production, send to error tracking service
    // This would integrate with services like Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { extra: logData })
    }
  }
}

/**
 * Hook for using error recovery in React components
 */
export function useErrorRecovery() {
  const handleError = (
    error: Error,
    context: ErrorContext,
    recoveryActions?: RecoveryAction[]
  ): EnhancedError => {
    const enhanced = ErrorRecoveryManager.enhanceError(error, context, recoveryActions)
    ErrorRecoveryManager.logError(enhanced)
    return enhanced
  }

  const withRetry = <T>(
    operation: () => Promise<T>,
    options?: ErrorRecoveryOptions
  ): Promise<T> => {
    return ErrorRecoveryManager.withRetry(operation, options)
  }

  return {
    handleError,
    withRetry,
    getUserFriendlyMessage: ErrorRecoveryManager.getUserFriendlyMessage,
    getRecoveryGuidance: ErrorRecoveryManager.getRecoveryGuidance,
  }
}
