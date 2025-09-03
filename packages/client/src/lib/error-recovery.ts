/**
 * Error Recovery Utilities for Client-Side Error Handling
 * Provides retry mechanisms and user guidance using unified error system
 */

import {
  BaseError,
  ErrorContextUtils,
  ErrorLayer,
  type ErrorContext
} from '@starships/errors';
import { ErrorCategory } from '@starships/protocol';

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

export interface EnhancedError extends Error {
  code?: string
  category?: ErrorCategory
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
   * Categorize error type using protocol ErrorCategory
   */
  private static categorizeError(error: Error): EnhancedError['category'] {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()

    if (name.includes('network') || message.includes('network') || message.includes('fetch')) {
      return ErrorCategory.NETWORK
    }

    if (
      name.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return ErrorCategory.VALIDATION
    }

    if (message.includes('unauthorized') || message.includes('auth')) {
      return ErrorCategory.AUTHENTICATION
    }

    if (message.includes('forbidden') || message.includes('permission') || message.includes('access denied')) {
      return ErrorCategory.AUTHORIZATION
    }

    if (message.includes('not found')) {
      return ErrorCategory.NOT_FOUND
    }

    if (message.includes('server error') || message.includes('internal server')) {
      return ErrorCategory.INTERNAL
    }

    return ErrorCategory.INTERNAL
  }

  /**
   * Determine error severity
   */
  private static determineSeverity(error: Error, context: ErrorContext): EnhancedError['severity'] {
    const category = this.categorizeError(error)

    switch (category) {
      case ErrorCategory.NETWORK:
        return context.operation.includes('save') || context.operation.includes('submit')
          ? 'high'
          : 'medium'
      case ErrorCategory.VALIDATION:
        return 'low'
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        return 'high'
      case ErrorCategory.INTERNAL:
      case ErrorCategory.SERVICE_UNAVAILABLE:
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
      case ErrorCategory.NETWORK:
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

      case ErrorCategory.VALIDATION:
        actions.push({
          id: 'fix-validation',
          label: 'Fix Input',
          description: 'Correct the highlighted fields',
          action: () => {}, // Will focus first invalid field
          primary: true,
        })
        break

      case ErrorCategory.AUTHENTICATION:
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

      case ErrorCategory.AUTHORIZATION:
        actions.push({
          id: 'contact-admin',
          label: 'Contact Administrator',
          description: 'Request access permissions',
          action: () => {}, // Will be replaced with contact form
          primary: true,
        })
        break

      case ErrorCategory.INTERNAL:
      case ErrorCategory.SERVICE_UNAVAILABLE:
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
    const category = error.category || ErrorCategory.INTERNAL
    const operation = error.context?.operation || 'operation'

    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]: `Unable to connect to the server. Please check your internet connection and try again.`,
      [ErrorCategory.VALIDATION]: `Please check the highlighted fields and correct any errors.`,
      [ErrorCategory.AUTHENTICATION]: `Your session has expired. Please refresh the page and try again.`,
      [ErrorCategory.AUTHORIZATION]: `You don't have permission to perform this action. Please contact your administrator.`,
      [ErrorCategory.NOT_FOUND]: `The requested resource was not found.`,
      [ErrorCategory.CONFLICT]: `There was a conflict with your request. Please try again.`,
      [ErrorCategory.DATABASE]: `Database error occurred. Please try again later.`,
      [ErrorCategory.RATE_LIMIT]: `Too many requests. Please wait before trying again.`,
      [ErrorCategory.SERVICE_UNAVAILABLE]: `The service is temporarily unavailable. Please try again later.`,
      [ErrorCategory.INTERNAL]: `Something went wrong while ${operation}. Please try again.`,
    }

    return messages[category] || messages[ErrorCategory.INTERNAL]
  }

  /**
   * Get recovery guidance text
   */
  static getRecoveryGuidance(error: EnhancedError): string {
    const category = error.category || ErrorCategory.INTERNAL

    const guidance: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]:
        'This usually happens when there are connectivity issues. Check your internet connection and try again.',
      [ErrorCategory.VALIDATION]:
        'Make sure all required fields are filled out correctly and match the expected format.',
      [ErrorCategory.AUTHENTICATION]:
        'Your login session may have expired. Refreshing the page should resolve this.',
      [ErrorCategory.AUTHORIZATION]:
        'Contact your system administrator if you believe you should have access to this feature.',
      [ErrorCategory.NOT_FOUND]:
        'The resource you are looking for may have been moved or deleted.',
      [ErrorCategory.CONFLICT]:
        'Another user may have modified this resource. Please refresh and try again.',
      [ErrorCategory.DATABASE]:
        'There was a database issue. This is usually temporary - please try again.',
      [ErrorCategory.RATE_LIMIT]:
        'You have exceeded the rate limit. Please wait a few moments before trying again.',
      [ErrorCategory.SERVICE_UNAVAILABLE]:
        'Our servers are experiencing temporary issues. Please wait a moment and try again.',
      [ErrorCategory.INTERNAL]: 'This is usually a temporary issue. Trying again often resolves the problem.',
    }

    return guidance[category] || guidance[ErrorCategory.INTERNAL]
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Create error context using unified ErrorContextUtils
   */
  static createContext(
    operation: string,
    component: string,
    additionalData?: Record<string, any>
  ): ErrorContext {
    return ErrorContextUtils.client(component, operation, {
      metadata: additionalData,
    })
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
