import { setTokenProvider, type SyncedUser } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

export type AuthMethod = 'password' | 'google' | 'github';

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
  hasPassword: boolean
  authMethods: AuthMethod[]
  primaryAuthMethod: 'password' | 'oauth'
}

interface AuthLoginResponse {
  user?: AuthUser
  token?: string
  starship?: {
    slug: string
  }
  message?: string
  // Email verification fields
  emailNotVerified?: boolean
  canResendVerification?: boolean
}

interface AuthRegisterResponse {
  user?: AuthUser
  token?: string
  starship?: {
    slug: string
  }
  message?: string
  // Email verification fields
  emailVerificationSent?: boolean
}

// Centralized query keys
export const AUTH_QUERY_KEYS = {
  all: ['auth'] as const,
  user: () => [...AUTH_QUERY_KEYS.all, 'user'] as const,
  me: () => [...AUTH_QUERY_KEYS.user(), 'me'] as const,
  emailVerification: () => [...AUTH_QUERY_KEYS.all, 'email-verification'] as const,
  passwordReset: () => [...AUTH_QUERY_KEYS.all, 'password-reset'] as const,
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

      if (!user || !token) {
        console.error('[AUTH] Login successful but missing user or token')
        return
      }

      // Store token
      setStoredToken(token)

      // Update auth user cache
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      // Redirect to appropriate page after login
      if (starship) {
        router.push(`/ship/${starship.slug}/conversations`)
      } else {
        // If no starship available, redirect to profile which handles starship routing
        router.push('/profile')
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
      // Check if this is an email verification response
      if (data.emailVerificationSent) {
        // Email verification sent - no immediate login
        // The UI should already show the verification message
        return
      }

      const { user, token, starship } = data

      if (!user || !token) {
        console.error('[AUTH] Registration successful but missing user or token')
        return
      }

      // Store token
      setStoredToken(token)

      // Update auth user cache
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      // Redirect to starship's conversation if available
      if (starship) {
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

// OAuth login mutation - SECURE authorization code exchange
export function useOAuthLogin() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({ authCode }: { authCode: string }) => {
      // Exchange authorization code for JWT token via secure POST endpoint
      const response = await fetch('/api/v1/auth/oauth/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authCode }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'OAuth code exchange failed')
      }

      const data = await response.json()
      return data.data as AuthLoginResponse
    },
    onSuccess: data => {
      const { user, token, starship } = data

      if (!user || !token) {
        console.error('[AUTH] OAuth successful but missing user or token')
        return
      }

      // Store token (same as regular login)
      setStoredToken(token)

      // Update auth user cache (same as regular login)
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      // Redirect to starship's conversation if available (same as regular login)
      if (starship) {
        router.push(`/ship/${starship.slug}/conversations`)
      }

      // Invalidate all queries to refetch with new auth context (same as regular login)
      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      console.error('[AUTH] OAuth login error:', error)
      const errorMessage = error.message || 'OAuth login failed'
      toast.error('OAuth login failed', {
        description: errorMessage,
      })
    },
  })
}

// Resend verification mutation
export function useResendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to resend verification email')
      }

      return data.data
    },
    onSuccess: () => {
      toast.success('Verification email sent! Please check your email.')
    },
    onError: (error: any) => {
      console.error('[AUTH] Resend verification error:', error)
      toast.error('Failed to send verification email. Please try again.')
    },
  })
}

// Forgot password mutation
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send reset email')
      }
      return result.data
    },
    onSuccess: () => {
      toast.success('Password reset link sent! Check your email.')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send reset email. Please try again.')
    },
  })
}

// Reset password mutation
export function useResetPassword(options?: { onSuccess?: (data: any) => void; onError?: (error: any) => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: { token: string; newPassword: string; confirmPassword: string }) => {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to reset password')
      }
      return result.data
    },
    onSuccess: (data) => {
      // SECURITY: Clear authentication state after password reset
      setStoredToken(null)
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), null)
      queryClient.clear()
      
      // Don't show toast here - let the login page handle the success message via URL param
      router.push('/login?reset=success')
      options?.onSuccess?.(data)
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to reset password'
      toast.error(message)
      options?.onError?.(error)
      throw error // Re-throw for component error handling
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
  const oauthLoginMutation = useOAuthLogin()
  const resendVerificationMutation = useResendVerification()
  const logoutMutation = useLogout()

  // Set up token provider for API calls on mount
  useEffect(() => {
    setTokenProvider(async () => {
      const token = getStoredToken()
      return token
    })
  }, [])

  // Create synced user data for compatibility - MEMOIZED to prevent rerenders
  const syncedUser: SyncedUser | null = useMemo(() => {
    if (!user) return null
    return {
      id: user.id,
      email: user.email,
      displayName: user.name,
      avatar: user.avatar,
      createdAt: new Date().toISOString(),
    }
  }, [user])

  // Login function
  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string; message?: string; emailNotVerified?: boolean; canResendVerification?: boolean }> => {
      try {
        const result = await loginMutation.mutateAsync({ email, password })
        if (result.emailNotVerified) {
          return { success: true, emailNotVerified: true, canResendVerification: result.canResendVerification, message: result.message }
        }
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'Login failed' }
      }
    },
    [loginMutation]
  )

  // Register function
  const register = useCallback(
    async (email: string, password: string, name?: string): Promise<{ success: boolean; error?: string; message?: string; emailVerificationSent?: boolean }> => {
      try {
        const result = await registerMutation.mutateAsync({ email, password, name })
        if (result.emailVerificationSent) {
          return { success: true, emailVerificationSent: true, message: result.message }
        }
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'Registration failed' }
      }
    },
    [registerMutation]
  )

  // OAuth login function - SECURE code exchange
  const oauthLogin = useCallback(async (authCode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await oauthLoginMutation.mutateAsync({ authCode })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'OAuth login failed' }
    }
  }, [oauthLoginMutation])

  // Logout function
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  // Set password function for OAuth-only users
  const setPassword = useCallback(
    async (newPassword: string, confirmPassword: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const token = getStoredToken()
        if (!token) throw new Error('Not authenticated')

        const response = await fetch('/api/v1/auth/set-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ newPassword, confirmPassword })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error?.message || 'Failed to set password')
        }

        // Refresh user data to get updated auth info
        await refetch()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    },
    [refetch]
  )

  // Resend verification function
  const resendVerification = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await resendVerificationMutation.mutateAsync(email)
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'Failed to resend verification email' }
      }
    },
    [resendVerificationMutation]
  )

  const isAuthenticated = !!user
  const authError = error?.message || loginMutation.error?.message || registerMutation.error?.message || oauthLoginMutation.error?.message || resendVerificationMutation.error?.message || null
  const authLoading = isLoading || loginMutation.isPending || registerMutation.isPending || oauthLoginMutation.isPending || resendVerificationMutation.isPending || logoutMutation.isPending

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
    oauthLogin,
    logout,
    setPassword,
    resendVerification,
    getToken: getStoredToken, // Expose token getter

    // Authentication method info
    hasPassword: user?.hasPassword || false,
    authMethods: user?.authMethods || [],
    primaryAuthMethod: user?.primaryAuthMethod || 'password',
    isOAuthOnly: user?.hasPassword === false && user?.authMethods?.some(m => ['google', 'github'].includes(m)),

    // Compatibility properties for existing components
    userId: syncedUser?.id || user?.id,
    userEmail: syncedUser?.email || user?.email,
    userName: syncedUser?.displayName || user?.name,
    userAvatar: syncedUser?.avatar || user?.avatar,

    // Additional TanStack Query utilities
    refetchUser: refetch,
    loginMutation,
    registerMutation,
    oauthLoginMutation,
    resendVerificationMutation,
    logoutMutation,
  }
}
