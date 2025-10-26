'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import Userback from '@userback/widget'
import type { UserbackWidget } from '@userback/widget'
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
    const init = async () => {
      try {
        const options: any = {}

        // Identify logged-in users
        if (isAuthenticated && userId && userEmail) {
          options.user_data = {
            id: userId,
            info: {
              name: userName || userEmail,
              email: userEmail,
            },
          }
        }

        // Initialize Userback widget and get the instance
        const instance = await Userback(token, options)
        setUserback(instance)
      } catch (error) {
        console.error('Failed to initialize Userback:', error)
      }
    }

    if (token) {
      init()
    }
  }, [token, isAuthenticated, userId, userEmail, userName])

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
