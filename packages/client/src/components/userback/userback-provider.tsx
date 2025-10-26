'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import Userback from '@userback/widget'
import type { UserbackOptions, UserbackWidget } from '@userback/widget'
import { useAuthContext } from '@/providers/auth-provider'

// Create the context
const UserbackContext = createContext<UserbackWidget | null>(null)

interface UserbackProviderProps {
  children: React.ReactNode
  token: string
}

export function UserbackProvider({ children, token }: UserbackProviderProps) {
  const [userback, setUserback] = useState<UserbackWidget | null>(null)
  const { isAuthenticated, userId, userEmail, userName } = useAuthContext()

  useEffect(() => {
    const initUserback = async () => {
      try {
        const options: UserbackOptions = {}

        // Add user data if authenticated
        if (isAuthenticated && userId && userEmail) {
          options.user_data = {
            id: userId,
            info: {
              name: userName,
              email: userEmail,
            },
          }

          // Configure to hide name/email fields for authenticated users
          // The widget settings types are incomplete, so we extend them here
          options.widget_settings = {
            form_settings: {
              general: {
                display_name: false,
                display_email: false,
              },
            },
          } as any
        } else {
          // For non-authenticated users, show name/email fields
          options.widget_settings = {
            form_settings: {
              general: {
                display_name: true,
                display_email: true,
              },
            },
          } as any
        }

        const instance = await Userback(token, options)
        setUserback(instance)
      } catch (error) {
        console.error('Failed to initialize Userback:', error)
      }
    }

    initUserback()
  }, [token]) // Initialize once on mount or when token changes

  // Update user identification when auth state changes
  useEffect(() => {
    if (!userback) return

    if (isAuthenticated && userId && userEmail) {
      // Identify the user when they log in
      userback.identify(userId, {
        name: userName,
        email: userEmail,
      })
    } else if (!isAuthenticated) {
      // Clear user data when they log out
      userback.identify('anonymous', {
        name: '',
        email: '',
      })
    }
  }, [userback, isAuthenticated, userId, userEmail, userName])

  return <UserbackContext.Provider value={userback}>{children}</UserbackContext.Provider>
}

/**
 * Hook to access Userback instance
 * Use this to programmatically interact with the Userback widget
 *
 * @example
 * const userback = useUserback()
 * userback?.openForm() // Open feedback form
 * userback?.openForm('bug') // Open bug report form
 */
export function useUserback() {
  return useContext(UserbackContext)
}
