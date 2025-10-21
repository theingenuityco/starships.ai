/**
 * Hook for unified error handling with toast notifications
 * Combines error preparation with UI display logic
 */

import { toast } from 'sonner'
import { prepareErrorForDisplay, type ErrorDisplay } from '@/lib/error-recovery'

/**
 * Custom hook for handling errors consistently across the application
 * Provides error preparation and toast notification in one interface
 */
export function useErrorHandler() {
  /**
   * Handle an error by preparing it for display and optionally showing a toast
   * 
   * @param error - The error to handle
   * @param context - Context string for logging (e.g., 'LoginForm', 'useAuth')
   * @param showToast - Whether to display a toast notification (default: true)
   * @returns The prepared error display object
   */
  const handleError = (error: any, context: string, showToast = true): ErrorDisplay => {
    const errorDisplay = prepareErrorForDisplay(error, context)
    
    if (showToast) {
      toast.error(errorDisplay.title, {
        description: errorDisplay.description,
        action: errorDisplay.action ? {
          label: errorDisplay.action.label,
          onClick: () => errorDisplay.action!.action()
        } : undefined
      })
    }
    
    return errorDisplay
  }
  
  return { handleError }
}