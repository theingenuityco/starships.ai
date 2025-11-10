'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { USER_QUERY_KEYS } from '@/hooks/useUsers'
import { EMAIL_CHANGE_QUERY_KEYS } from '@/hooks/useEmailChange'
import { useAuth } from '@/hooks/useAuth'

/**
 * Global component to handle email change query parameters
 * Works on any page, not just profile page
 */
export function EmailChangeToastHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  const emailChangeToastShownRef = useRef(false)

  // Reset ref when pathname changes (new page)
  useEffect(() => {
    emailChangeToastShownRef.current = false
  }, [pathname])

  useEffect(() => {
    // Add safety check to prevent hydration issues
    if (typeof window === 'undefined' || !searchParams) {
      return
    }

    try {
      const emailChange = searchParams.get('emailChange')
      const expectedEmail = searchParams.get('expectedEmail')

      // Handle email change success message
      if (emailChange === 'success' && !emailChangeToastShownRef.current) {
        // Set ref immediately to prevent duplicate toasts
        emailChangeToastShownRef.current = true
        
        // Use a small delay to ensure the page has fully loaded
        const timeoutId = setTimeout(() => {
          const message =
            expectedEmail && expectedEmail.trim().length > 0
              ? `Email changed successfully. Please sign in as ${expectedEmail}.`
              : 'Email changed successfully!'

          toast.success(message)

          // Refresh user data if user is authenticated
          if (userId) {
            queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.detail(userId) })
            queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId) })
          }

          // Clear query param after handling (with a delay to ensure toast is visible)
          setTimeout(() => {
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('emailChange')
            newUrl.searchParams.delete('expectedEmail')
            const newPath = newUrl.pathname + (newUrl.search ? newUrl.search : '')
            router.replace(newPath, { scroll: false })
          }, 100)
        }, 100)

        return () => clearTimeout(timeoutId)
      } else if (emailChange === 'error' && !emailChangeToastShownRef.current) {
        // Set ref immediately to prevent duplicate toasts
        emailChangeToastShownRef.current = true
        
        // Use a small delay to ensure the page has fully loaded
        const timeoutId = setTimeout(() => {
          toast.error('Email change failed. Please try again.')

          // Clear query param after handling
          setTimeout(() => {
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('emailChange')
            const newPath = newUrl.pathname + (newUrl.search ? newUrl.search : '')
            router.replace(newPath, { scroll: false })
          }, 100)
        }, 100)

        return () => clearTimeout(timeoutId)
      }
    } catch (error) {
      // Silently handle URL parameter errors
      console.error('[EmailChangeToastHandler] Error handling email change query param:', error)
    }
  }, [searchParams, router, queryClient, userId])

  return null
}

