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
    let cancelled = false

    const init = async () => {
      try {
        // Avoid re-initializing if we already have an instance.
        if (userback) return

        // Initialize Userback widget and get the instance
        const instance = await Userback(token, { autohide: false })

        if (!cancelled) setUserback(instance)
      } catch (error) {
        console.error('Failed to initialize Userback:', error)
      }
    }

    if (token) {
      init()
    }

    return () => {
      cancelled = true
    }
    // Intentionally only keyed on token + current instance to prevent repeated init loops.
  }, [token, userback])

  useEffect(() => {
    if (!userback) return
    if (!isAuthenticated || !userId) return

    try {
      userback.identify(userId, {
        name: userName || userEmail,
        email: userEmail,
      })
    } catch (error) {
      console.error('Failed to identify Userback user:', error)
    }
  }, [userback, isAuthenticated, userId, userEmail, userName])

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
