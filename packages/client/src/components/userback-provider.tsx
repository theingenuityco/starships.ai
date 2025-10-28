'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import Userback from '@userback/widget'
import type { UserbackWidget, UserbackOptions } from '@userback/widget'
import { useAuthContext } from '@/providers/auth-provider'

// Create the context
const UserbackContext = createContext<UserbackWidget | null>(null)

interface UserbackProviderProps {
  children: React.ReactNode
  token: string
}

export function UserbackProvider({ children, token }: UserbackProviderProps) {
  const [userback, setUserback] = useState<UserbackWidget | null>(null)
  const [initialized, setInitialized] = useState(false)
  const { userId, userEmail, userName } = useAuthContext()

  // Initialize Userback widget once with initial user data
  useEffect(() => {
    if (initialized || !token) return

    const init = async () => {
      try {
        const options: UserbackOptions = {
          autohide: true,
        }

        // Set user data if available during initialization
        if (userId && userEmail) {
          options.user_data = {
            id: userId,
            info: {
              name: userName || userEmail,
              email: userEmail,
            },
          }
        }

        const instance = await Userback(token, options)
        setUserback(instance)
        setInitialized(true)
      } catch (error) {
        console.error('Failed to initialize Userback:', error)
      }
    }

    init()
  }, [token, initialized])

  // Update user identification when auth data changes (after initialization)
  useEffect(() => {
    if (!userback || !initialized || !userId || !userEmail) return

    // Use identify() for real-time user updates after widget is initialized
    userback.identify(userId, {
      name: userName || userEmail,
      email: userEmail,
      userId: userId,
    })
  }, [userback, initialized, userId, userEmail, userName, userId])

  return <UserbackContext.Provider value={userback}>{children}</UserbackContext.Provider>
}

/**
 * Custom hook to access Userback instance
 * Use this to programmatically interact with the Userback widget
 *
 * @example
 * const userback = useUserback()
 * userback?.openForm() // Open feedback form
 * userback?.show() // Show widget
 */
export function useUserback() {
  return useContext(UserbackContext)
}
