import { setTokenProvider, type SyncedUser } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
}

interface AuthLoginResponse {
  user: AuthUser
  token: string
  starship?: {
    slug: string
  }
}

interface AuthRegisterResponse {
  user: AuthUser
  token: string
  starship?: {
    slug: string
  }
}

// Centralized query keys
export const AUTH_QUERY_KEYS = {
  all: ['auth'] as const,
  user: () => [...AUTH_QUERY_KEYS.all, 'user'] as const,
  me: () => [...AUTH_QUERY_KEYS.user(), 'me'] as const,
} as const

// Token storage utilities
const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('starships_auth_token')
}

const setStoredToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem('starships_auth_token', token)
  } else {
    localStorage.removeItem('starships_auth_token')
  }
}

// Validate token and get user info
const validateToken = async (token: string): Promise<AuthUser | null> => {
  try {
    const response = await fetch('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      const data = await response.json()
      return data.data || data // Handle different response formats
    }

    return null
  } catch (error) {
    console.error('[AUTH] Token validation failed:', error)
    return null
  }
}

// Get current user info using query
export function useAuthUser() {
  return useQuery({
    queryKey: AUTH_QUERY_KEYS.me(),
    queryFn: async (): Promise<AuthUser | null> => {
      const token = getStoredToken()
      if (!token) {
        return null
      }

      return await validateToken(token)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on 401 (unauthorized) - token is invalid
      if (error?.response?.status === 401) {
        return false
      }
      return failureCount < 2
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
}

// Login mutation
export function useLogin() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok || !data.data) {
        throw new Error(data.error?.message || 'Login failed')
      }

      return data.data as AuthLoginResponse
    },
    onSuccess: data => {
      const { user, token, starship } = data

      // Store token
      setStoredToken(token)

      // Update auth user cache
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      console.log('[AUTH] User logged in:', user.email)

      // Redirect to starship's conversation if available
      if (starship) {
        console.log('[AUTH] Redirecting to starship conversation:', starship.slug)
        router.push(`/ship/${starship.slug}/conversations`)
      }

      // Invalidate all queries to refetch with new auth context
      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      console.error('[AUTH] Login error:', error)
      const errorMessage = error.message || 'Login failed'
      toast.error('Login failed', {
        description: errorMessage,
      })
    },
  })
}

// Register mutation
export function useRegister() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({ email, password, name }: { email: string; password: string; name?: string }) => {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await response.json()

      if (!response.ok || !data.data) {
        throw new Error(data.error?.message || 'Registration failed')
      }

      return data.data as AuthRegisterResponse
    },
    onSuccess: data => {
      const { user, token, starship } = data

      // Store token
      setStoredToken(token)

      // Update auth user cache
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      console.log('[AUTH] User registered:', user.email)

      // Redirect to starship's conversation if available
      if (starship) {
        console.log('[AUTH] Redirecting to starship conversation:', starship.slug)
        router.push(`/ship/${starship.slug}/conversations`)
      }

      // Invalidate all queries to refetch with new auth context
      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      console.error('[AUTH] Registration error:', error)
      const errorMessage = error.message || 'Registration failed'
      toast.error('Registration failed', {
        description: errorMessage,
      })
    },
  })
}

// Logout mutation
export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const token = getStoredToken()

      try {
        // Call logout endpoint (optional since JWT is stateless)
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch (error) {
        console.error('[AUTH] Logout API call failed:', error)
      }
    },
    onSuccess: () => {
      // Clear token storage
      setStoredToken(null)

      // Clear all cached data
      queryClient.clear()

      // Set auth user to null
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), null)

      console.log('[AUTH] User logged out')
    },
    onError: (error: any) => {
      console.error('[AUTH] Logout error:', error)
      // Still clear local data even if API call fails
      setStoredToken(null)
      queryClient.clear()
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), null)
    },
  })
}

/**
 * Main authentication hook - TanStack Query powered
 * Handles all authentication operations using TanStack Query for optimal caching and state management
 */
export function useAuth() {
  const { data: user, isLoading, error, refetch } = useAuthUser()
  const loginMutation = useLogin()
  const registerMutation = useRegister()
  const logoutMutation = useLogout()

  // Set up token provider for API calls on mount
  useEffect(() => {
    setTokenProvider(async () => {
      const token = getStoredToken()
      return token
    })
  }, [])

  // Create synced user data for compatibility
  const syncedUser: SyncedUser | null = user
    ? {
        id: user.id,
        username: user.name || user.email.split('@')[0],
        email: user.email,
        displayName: user.name,
        avatar: user.avatar,
        createdAt: new Date().toISOString(),
      }
    : null

  // Login function
  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await loginMutation.mutateAsync({ email, password })
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'Login failed' }
      }
    },
    [loginMutation]
  )

  // Register function
  const register = useCallback(
    async (email: string, password: string, name?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await registerMutation.mutateAsync({ email, password, name })
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'Registration failed' }
      }
    },
    [registerMutation]
  )

  // Logout function
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const isAuthenticated = !!user
  const authError = error?.message || loginMutation.error?.message || registerMutation.error?.message || null
  const authLoading = isLoading || loginMutation.isPending || registerMutation.isPending || logoutMutation.isPending

  return {
    // Auth state
    user,
    syncedUser,
    isAuthenticated,
    isLoading: authLoading,
    error: authError,

    // Auth actions
    login,
    register,
    logout,
    getToken: getStoredToken, // Expose token getter

    // Compatibility properties for existing components
    userId: syncedUser?.id || user?.id,
    userEmail: syncedUser?.email || user?.email,
    userName: syncedUser?.displayName || user?.name,
    userAvatar: syncedUser?.avatar || user?.avatar,

    // Additional TanStack Query utilities
    refetchUser: refetch,
    loginMutation,
    registerMutation,
    logoutMutation,
  }
}
