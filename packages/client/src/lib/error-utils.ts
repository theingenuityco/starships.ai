/**
 * Centralized error handling utilities
 */

export interface ApiError {
  response?: {
    data?: {
      error?: string
      details?: string
    }
  }
  message?: string
}

/**
 * Extract a user-friendly error message from various error types
 * @param error - The error object (can be from Axios or native Error)
 * @param defaultMessage - Fallback message if no specific error found
 * @returns A formatted error message string
 */
export function extractErrorMessage(error: unknown, defaultMessage: string): string {
  const apiError = error as ApiError

  const message = apiError?.response?.data?.error || apiError?.message || defaultMessage
  const details = apiError?.response?.data?.details || ''

  return details ? `${message}\n${details}` : message
}

/**
 * Check if an error is a cancellation error (for subscription handling)
 */
export function isSubscriptionCancellationError(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError?.response?.data?.error?.toLowerCase().includes('subscription') || false
}
