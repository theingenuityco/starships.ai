import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs'
import { LoginLink, LogoutLink, RegisterLink } from '@kinde-oss/kinde-auth-nextjs/components'
import { useEffect, useState, useCallback } from 'react'
import { userAPI, type SyncedUser, setTokenProvider } from '@/lib/api'

/**
 * Custom hook for accessing Kinde authentication state and synced user data
 * Provides a consistent interface for auth operations across the app
 */
export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading: kindeLoading,
    getToken,
    getClaim,
    getAccessTokenRaw,
    accessTokenRaw,
  } = useKindeBrowserClient()

  // Force refresh authentication state on mount
  const [isInitialized, setIsInitialized] = useState(false)
  const [forceRefresh, setForceRefresh] = useState(0)

  // TESTING BACKDOOR: Only activate when explicitly enabled
  const enableTestingBackdoor = process.env.NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR === 'true'
  const shouldUseTestingBackdoor = enableTestingBackdoor && !kindeLoading && !isAuthenticated
  
  if (shouldUseTestingBackdoor) {
    console.log('[AUTH] Testing backdoor activated - auth testing mode enabled')
  }

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Check server-side auth state and force client refresh if needed
  useEffect(() => {
    if (!isInitialized && !kindeLoading) {
      const checkServerAuth = async () => {
        try {
          // Check if we have auth cookies by calling a protected endpoint
          const response = await fetch('/api/auth/me')
          const data = await response.json()
          
          console.log('[AUTH] Server auth check:', data)
          
          if (data.authenticated && !isAuthenticated) {
            console.log('[AUTH] Server authenticated but client not - checking for refresh flag')
            
            // Check if we need to force a page reload
            const refreshResponse = await fetch('/api/auth/refresh')
            const refreshData = await refreshResponse.json()
            
            if (refreshData.needsClientRefresh) {
              console.log('[AUTH] Setting refresh flag and reloading page')
              // The refresh endpoint sets a cookie, page will reload when detected
            }
          }
        } catch (error) {
          console.error('[AUTH] Server auth check failed:', error)
        }
        setIsInitialized(true)
      }
      checkServerAuth()
    }
  }, [isAuthenticated, kindeLoading, isInitialized])

  // Auto-sync user when Kinde authentication completes
  useEffect(() => {
    const syncUser = async () => {
      if (!isAuthenticated || !user || syncedUser || syncLoading) {
        return
      }

      setSyncLoading(true)
      setSyncError(null)

      try {
        console.log('[USER-SYNC] Syncing Kinde user to backend:', user.id)

        const syncedUserData = await userAPI.syncUser({
          kindeId: user.id,
          email: user.email!,
          name:
            user.given_name || user.family_name
              ? `${user.given_name} ${user.family_name}`.trim()
              : undefined,
          avatar: user.picture || undefined,
        })

        setSyncedUser(syncedUserData)
        console.log('[USER-SYNC] User synced successfully:', syncedUserData.id)
      } catch (error) {
        console.error('[USER-SYNC] Failed to sync user:', error)
        setSyncError('Failed to sync user data')
      } finally {
        setSyncLoading(false)
      }
    }

    syncUser()
  }, [isAuthenticated, user?.id]) // Fixed: Only depend on auth state and user ID

  // Set up token provider for API client authentication
  useEffect(() => {
    console.log(
      '[AUTH] Setting up token provider, isAuthenticated:',
      isAuthenticated,
      'kindeLoading:',
      kindeLoading
    )

    // Critical: Only set up token provider after loading is complete
    if (!kindeLoading) {
      setTokenProvider(async () => {
        // TESTING BACKDOOR: Provide test token when explicitly enabled
        if (shouldUseTestingBackdoor) {
          console.log('[AUTH] Providing test token for testing backdoor')
          return 'test-auth-token'
        }
        
        if (isAuthenticated) {
          try {
            console.log('[AUTH] Attempting to get access token...')

            // Try multiple token methods for compatibility
            let accessToken = null

            // First try getToken() which is the most reliable method
            try {
              accessToken = await getToken()
              console.log('[AUTH] getToken result:', accessToken ? 'Token present' : 'No token')
            } catch (tokenError) {
              console.warn('[AUTH] getToken failed:', tokenError)
            }

            // Fallback to raw token methods
            if (!accessToken && getAccessTokenRaw) {
              try {
                accessToken = getAccessTokenRaw()
                console.log(
                  '[AUTH] getAccessTokenRaw result:',
                  accessToken ? 'Token present' : 'No token'
                )
              } catch (rawError) {
                console.warn('[AUTH] getAccessTokenRaw failed:', rawError)
              }
            }

            if (!accessToken && accessTokenRaw) {
              accessToken = accessTokenRaw
              console.log(
                '[AUTH] accessTokenRaw result:',
                accessToken ? 'Token present' : 'No token'
              )
            }

            if (accessToken) {
              console.log('[AUTH] Access token retrieved for API - length:', accessToken.length)
              // Validate token format (JWT should have 3 parts separated by dots)
              const tokenParts = accessToken.split('.')
              if (tokenParts.length !== 3) {
                console.error('[AUTH] Invalid token format - not a valid JWT')
                return null
              }
            } else {
              console.error('[AUTH] No access token available despite being authenticated')
            }

            return accessToken
          } catch (error) {
            console.error('[AUTH] Failed to get access token:', error)
            return null
          }
        }
        console.log('[AUTH] Not authenticated, returning null token')
        return null
      })
    }
  }, [isAuthenticated, kindeLoading])

  const isLoading = kindeLoading || syncLoading

  // TESTING BACKDOOR: Return mock authenticated state when explicitly enabled
  if (shouldUseTestingBackdoor) {
    const mockUser = {
      id: 'test-user-1',
      email: 'test@starships.ai',
      given_name: 'Test',
      family_name: 'User',
      picture: undefined
    }
    
    return {
      // Kinde user information
      kindeUser: mockUser,
      isAuthenticated: true,
      isLoading: false,

      // Synced user data (mock)
      syncedUser: {
        id: 'test-user-1',
        email: 'test@starships.ai',
        displayName: 'Test User',
        username: 'test-user',
        avatar: undefined,
        kindeId: 'test-user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      syncError: null,

      // Token management (mock)
      getToken: async () => 'test-auth-token',
      getClaim: () => null,

      // Auth components
      LoginLink,
      LogoutLink,
      RegisterLink,

      // Convenience properties
      userId: 'test-user-1',
      userEmail: 'test@starships.ai',
      userName: 'Test User',
      userAvatar: undefined,

      // For backwards compatibility
      user: mockUser,
    }
  }

  return {
    // Kinde user information
    kindeUser: user,
    isAuthenticated,
    isLoading,

    // Synced user data (from our backend)
    syncedUser,
    syncError,

    // Token management
    getToken,
    getClaim,

    // Auth components (for use in JSX)
    LoginLink,
    LogoutLink,
    RegisterLink,

    // Convenience properties (prefer synced user data when available)
    userId: syncedUser?.id || user?.id,
    userEmail: syncedUser?.email || user?.email,
    userName:
      syncedUser?.displayName ||
      syncedUser?.username ||
      (user?.given_name || user?.family_name
        ? `${user?.given_name} ${user?.family_name}`.trim()
        : user?.email),
    userAvatar: syncedUser?.avatar || user?.picture,

    // For backwards compatibility
    user: syncedUser || user,
  }
}
