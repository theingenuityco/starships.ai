import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs'
import { LoginLink, LogoutLink, RegisterLink } from '@kinde-oss/kinde-auth-nextjs/components'
import { useEffect, useState } from 'react'
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

  // TESTING BACKDOOR: Only activate when explicitly enabled
  const enableTestingBackdoor = process.env.NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR === 'true'
  const shouldUseTestingBackdoor = enableTestingBackdoor && !kindeLoading && !isAuthenticated
  
  if (shouldUseTestingBackdoor) {
    console.log('[AUTH] Testing backdoor activated - auth testing mode enabled')
  }

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

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

  // Note: Token provider is now set up globally in AuthInitializer component
  // This ensures it's configured once at app startup, not in every component

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
