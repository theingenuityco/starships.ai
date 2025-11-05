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

      // Handle email change success message
      if (emailChange === 'success' && !emailChangeToastShownRef.current) {
        emailChangeToastShownRef.current = true
        toast.success('Email changed successfully!')

        // Refresh user data if user is authenticated
        if (userId) {
          queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.detail(userId) })
          queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId) })
        }

        // Clear query param after handling
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('emailChange')
        router.replace(newUrl.pathname + newUrl.search, { scroll: false })
      } else if (emailChange === 'error' && !emailChangeToastShownRef.current) {
        emailChangeToastShownRef.current = true
        toast.error('Email change failed. Please try again.')

        // Clear query param after handling
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('emailChange')
        router.replace(newUrl.pathname + newUrl.search, { scroll: false })
      }
    } catch (error) {
      // Silently handle URL parameter errors
    }
  }, [searchParams, router, queryClient, userId])

  return null
}

