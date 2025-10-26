'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuthContext } from '@/providers/auth-provider'

// Extend Window interface for TypeScript
declare global {
  interface Window {
    Userback: any
  }
}

// Create the context
const UserbackContext = createContext<any>(null)


interface UserbackProviderProps {
  children: React.ReactNode
  token: string
}

export function UserbackProvider({ children, token }: UserbackProviderProps) {
  const [userback, setUserback] = useState<any>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const { isAuthenticated, userId, userEmail, userName } = useAuthContext()

  // Initialize Userback script ONCE
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (document.querySelector('script[src*="static.userback.io"]')) {
      console.log('✅ Userback script already exists')
      setScriptLoaded(true)
      return
    }

    console.log('🔵 Initializing Userback...')

    // Initialize window.Userback object BEFORE loading script
    window.Userback = window.Userback || {}
    window.Userback.access_token = token

    console.log('📦 Loading Userback script...')
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://static.userback.io/widget/v1.js'
    script.onload = () => {
      console.log('✅ Userback script loaded')
      setScriptLoaded(true)
      setTimeout(() => {
        if (window.Userback) {
          // Call start() to initialize the widget
          if (typeof window.Userback.start === 'function') {
            window.Userback.start()
            console.log('✅ Userback.start() called')
          }

          setUserback(window.Userback)
          console.log('✅ Userback initialized')

          // Now show the launcher
          setTimeout(() => {
            if (typeof window.Userback.showLauncher === 'function') {
              window.Userback.showLauncher()
              console.log('✅ Launcher shown')
            }
          }, 500)
        }
      }, 1000)
    }
    script.onerror = () => {
      console.error('❌ Failed to load Userback script')
    }
    ;(document.head || document.body).appendChild(script)
  }, [token]) // Only run once when token is available

  // Update user data when auth changes
  useEffect(() => {
    if (!scriptLoaded || typeof window === 'undefined') return

    console.log('🔄 Updating user data...')
    console.log('Auth state:', { isAuthenticated, userId, userEmail, userName })

    if (isAuthenticated && userId && userEmail) {
      // Update user data
      if (window.Userback) {
        window.Userback.user_data = {
          id: userId,
          info: {
            name: userName,
            email: userEmail,
          },
        }
        console.log('✅ User data updated:', window.Userback.user_data)

        // Use identify method if available
        if (typeof window.Userback.identify === 'function') {
          window.Userback.identify(userId, {
            name: userName,
            email: userEmail,
          })
          console.log('✅ User identified')
        }
      }
    }
  }, [scriptLoaded, isAuthenticated, userId, userEmail, userName])

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
