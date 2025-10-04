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

  // Handle structured server errors { error: { code, message, details } }
  const serverError = apiError?.response?.data?.error
  if (serverError && typeof serverError === 'object' && serverError !== null) {
    const message = (serverError as any).message || defaultMessage
    const details = (serverError as any).details || ''
    return details ? `${message}\n${details}` : message
  }

  // Fallback to legacy error format
  const message = apiError?.response?.data?.error || apiError?.message || defaultMessage
  const details = apiError?.response?.data?.details || ''

  return details ? `${message}\n${details}` : message
}

/**
 * Extract error code from server error response
 * @param error - The error object
 * @returns Error code string or null if not found
 */
export function extractErrorCode(error: unknown): string | null {
  const apiError = error as ApiError
  const serverError = apiError?.response?.data?.error
  if (serverError && typeof serverError === 'object' && serverError !== null) {
    return (serverError as any).code || null
  }
  return null
}

/**
 * Check if an error is a cancellation error (for subscription handling)
 */
export function isSubscriptionCancellationError(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError?.response?.data?.error?.toLowerCase().includes('subscription') || false
}
