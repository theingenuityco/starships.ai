/**
 * Simple Error Handling Hook
 * 
 * Replaces the complex ErrorRecoveryManager system with a clean, straightforward approach.
 * Uses server error responses when available, falls back to simple error messages.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'

/**
 * Interface for error objects that might come from API responses
 */
interface ApiErrorResponse {
  response?: {
    data?: {
      error?: {
        message?: string
        code?: string
      }
    }
    status?: number
  }
  message?: string
}

/**
 * Simple error handling hook that shows toast notifications and logs errors
 */
export function useSimpleError() {
  const handleError = useCallback((error: any, context: string) => {
    // Extract error message from server response or fallback to basic message
    const apiError = error as ApiErrorResponse
    const message = 
      apiError?.response?.data?.error?.message || 
      apiError?.message || 
      'Something went wrong. Please try again.'

    // Show user-friendly toast notification
    toast.error(message)

    // Log error for development debugging
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${context}]`, error)
    }
  }, [])

  return { handleError }
}