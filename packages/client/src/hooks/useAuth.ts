import { setTokenProvider, type SyncedUser } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useSimpleError } from './useSimpleError'
import { isValidRedirectUrl } from '@/lib/utils'
import type { ApiResponse } from '@starships/protocol'

export type AuthMethod = 'password' | 'google' | 'github'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
  hasPassword: boolean
  authMethods: AuthMethod[]
  primaryAuthMethod: 'password' | 'oauth'
  /**
   * Instance-level admin flag from backend.
   * When true, user can access instance admin views (e.g. publish approvals).
   * Optional for backward compatibility with older tokens.
   */
  isInstanceAdmin?: boolean
  /**
   * Wizard onboarding completion flag.
   * When true, user has completed the one-time wizard (name starship, invite, add agent).
   */
  wizardOnboardingCompleted?: boolean
}

interface AuthLoginResponse {
  user?: AuthUser
  token?: string
  starship?: {
    slug: string
    id?: string
    name?: string
  }
  message?: string
  // Email verification fields
  emailNotVerified?: boolean
  canResendVerification?: boolean
  isFirstLogin?: boolean
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
  const token = localStorage.getItem('starships_auth_token')

  // Defensive cleanup: avoid treating common placeholder values as real tokens.
  if (!token || token === 'null' || token === 'undefined') return null

  return token
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
    // Avoid hitting the network for obviously invalid tokens.
    const looksLikeJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    if (!token || !looksLikeJwt) {
      setStoredToken(null)
      return null
    }

    const response = await fetch('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      const json = (await response.json()) as ApiResponse<AuthUser>
      return json.data
    }

    // If the token is invalid/expired, clear it so we don't keep calling /auth/me on mount/focus.
    if (response.status === 401 || response.status === 403) {
      setStoredToken(null)
    }

    return null
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[AUTH-Token-Validation]', error)
    }
    return null
  }
}

function addWelcomeParamToPath(path: string): string {
  // `path` is expected to be a relative path beginning with `/`
  try {
    const url = new URL(path, window.location.origin)
    url.searchParams.set('welcome', '1')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    // Very defensive fallback; should not happen due to isValidRedirectUrl checks
    return path.includes('?') ? `${path}&welcome=1` : `${path}?welcome=1`
  }
}

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
    // `/auth/me` is a cheap "am I logged in?" check and should not spam on public pages.
    // With multiple `useAuth()` consumers (landing) and React StrictMode (dev), `refetchOnMount: 'always'`
    // can cause repeated requests. Prefer refetching only when the cache is stale.
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
  })
}

function getPostAuthRedirectTarget(): string | null {
  if (typeof window === 'undefined') return null
  const searchParams = new URLSearchParams(window.location.search)
  const returnUrl = searchParams.get('returnUrl')
  return returnUrl && isValidRedirectUrl(returnUrl) ? returnUrl : null
}

function isConnectorInstallPath(pathname: string | null | undefined): boolean {
  const p = (pathname || '').trim()
  return p.startsWith('/connectors/') && p.includes('/install')
}

async function handleLeadGenPostAuth(args: {
  token: string
  starship?: { slug: string; id?: string; name?: string }
  isFirstLogin?: boolean
  queryClient: ReturnType<typeof useQueryClient>
  router: { push: (url: string) => void }
}): Promise<boolean> {
  const { token, starship, isFirstLogin, queryClient, router } = args

  if (typeof window === 'undefined') return false

  try {
    const qp = new URLSearchParams(window.location.search)
    const hasPendingPrompt = !!window.sessionStorage.getItem('lead_gen_pending_prompt')
    const fromLeadGen = qp.get('fromLeadGen') === '1'

    // Debug: surface detection in console for troubleshooting (URL param may be lost in OAuth flows).
    if (fromLeadGen || hasPendingPrompt) {
      // eslint-disable-next-line no-console
      console.debug('[leadgen] post-auth flow detected', {
        fromLeadGen,
        hasPendingPrompt,
        starshipSlug: starship?.slug,
        starshipId: starship?.id,
      })
    }

    // Require a real pending prompt and a concrete starship target.
    if (!hasPendingPrompt || !starship?.slug || !starship.id) {
      return false
    }

    // Optimistically mark wizard onboarding as completed for this cohort in the client cache.
    queryClient.setQueryData(AUTH_QUERY_KEYS.me(), (prev: AuthUser | null | undefined) =>
      prev ? { ...prev, wizardOnboardingCompleted: true } : prev
    )

    // Best-effort server-side persistence so future sessions also skip the wizard.
    try {
      await fetch('/api/v1/users/me/onboarding/wizard/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
    } catch {
      // Ignore failures here; user experience should still proceed into the leadgen room.
    }

    // Ensure the dedicated leadgen room exists for this starship and send the user there.
    try {
      const resp = await fetch(`/api/v1/starships/${encodeURIComponent(starship.id)}/ensure-leadgen-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (resp.ok) {
        const json = (await resp.json()) as ApiResponse<{ room: { slug: string } }>
        const roomSlug = json.data?.room?.slug
        if (!roomSlug) {
          // If the server response is malformed, fall back to the default redirect logic.
          return false
        }

        try {
          if (typeof window !== 'undefined' && starship.id) {
            window.sessionStorage.setItem('lead_gen_last_starship_id', String(starship.id))
          }
        } catch {
          // Ignore storage errors; redirect should still proceed.
        }

        const baseTarget = `/ship/${starship.slug}/rooms/${encodeURIComponent(roomSlug)}?fromLeadGen=1`
        const target = isFirstLogin ? addWelcomeParamToPath(baseTarget) : baseTarget
        router.push(target)
        queryClient.invalidateQueries()
        return true
      } else {
        // eslint-disable-next-line no-console
        console.warn('[leadgen] ensure-leadgen-room failed', {
          status: resp.status,
          statusText: resp.statusText,
        })
      }
    } catch {
      // Ignore bundle provisioning errors and fall back to default redirect.
    }
  } catch {
    // Ignore storage/URL parsing errors and fall back to default behavior.
  }

  return false
}

const AUTOMATE_SESSION_KEY = 'automate_pending_data'

interface AutomatePendingData {
  companyName: string
  icp: {
    id: string
    name: string
    description: string
    traits: { industry: string; roles: string[]; companySize: string; geography: string }
    estimatedAccountCount: number
  }
  accounts: Array<{ company: string; role: string; industry: string; size: string; location: string }>
  createdAt: number
}

async function handleAutomatePostAuth(args: {
  token: string
  starship?: { slug: string; id?: string; name?: string }
  queryClient: ReturnType<typeof useQueryClient>
  router: { push: (url: string) => void }
}): Promise<boolean> {
  const { token, starship, queryClient, router } = args

  if (typeof window === 'undefined') return false

  try {
    const raw = window.localStorage.getItem(AUTOMATE_SESSION_KEY)
    if (!raw || !starship?.slug || !starship.id) return false

    const pending = JSON.parse(raw) as AutomatePendingData

    // Discard stale data (older than 24 hours)
    const AGE_LIMIT_MS = 24 * 60 * 60 * 1000
    if (!pending.createdAt || Date.now() - pending.createdAt > AGE_LIMIT_MS) {
      window.localStorage.removeItem(AUTOMATE_SESSION_KEY)
      return false
    }

    // Optimistically mark wizard as complete
    queryClient.setQueryData(AUTH_QUERY_KEYS.me(), (prev: AuthUser | null | undefined) =>
      prev ? { ...prev, wizardOnboardingCompleted: true } : prev
    )

    // Best-effort server-side wizard completion
    try {
      await fetch('/api/v1/users/me/onboarding/wizard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
    } catch {
      // Ignore; proceed anyway
    }

    // Create the dataset
    const datasetRes = await fetch(`/api/v1/starships/${encodeURIComponent(starship.id)}/datasets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `${pending.icp.name} Accounts`,
        description: pending.icp.description,
        primaryKey: 'company',
        columns: [
          { name: 'company', type: 'string' },
          { name: 'role', type: 'string' },
          { name: 'industry', type: 'string' },
          { name: 'size', type: 'string' },
          { name: 'location', type: 'string' },
        ],
      }),
    })

    if (!datasetRes.ok) return false

    const datasetJson = (await datasetRes.json()) as { data?: { dataset?: { id: string } } }
    const datasetId = datasetJson.data?.dataset?.id
    if (!datasetId) return false

    // Upsert the preview rows
    if (pending.accounts?.length > 0) {
      try {
        await fetch(
          `/api/v1/starships/${encodeURIComponent(starship.id)}/datasets/${encodeURIComponent(datasetId)}/rows`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ rows: pending.accounts, mode: 'append' }),
          }
        )
      } catch {
        // Rows are best-effort; still redirect to the dataset
      }
    }

    // Clear storage
    try {
      window.localStorage.removeItem(AUTOMATE_SESSION_KEY)
    } catch {
      // Ignore
    }

    router.push(`/ship/${starship.slug}/datasets/${encodeURIComponent(datasetId)}`)
    queryClient.invalidateQueries()
    return true
  } catch {
    // Fall back to default redirect
  }

  return false
}

// Login mutation
export function useLogin() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { handleError } = useSimpleError()

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
    onSuccess: async data => {
      const { user, token, starship, isFirstLogin } = data

      if (!user || !token) {
        handleError(new Error('We encountered an issue loading your account. Please try refreshing the page or contact support if this persists.'), 'useLogin')
        return
      }

      setStoredToken(token)
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      if (isConnectorInstallPath(typeof window !== 'undefined' ? window.location.pathname : null)) {
        queryClient.invalidateQueries()
        return
      }

      const didHandleLeadGen = await handleLeadGenPostAuth({
        token,
        starship,
        isFirstLogin,
        queryClient,
        router,
      })
      if (didHandleLeadGen) {
        return
      }

      const didHandleAutomate = await handleAutomatePostAuth({ token, starship, queryClient, router })
      if (didHandleAutomate) {
        return
      }

      const redirectTarget = getPostAuthRedirectTarget()
      const addWelcome = (p: string) => (isFirstLogin ? addWelcomeParamToPath(p) : p)
      if (redirectTarget) {
        router.push(addWelcome(redirectTarget))
      } else if (starship?.slug) {
        // Always route into the starship; onboarding is enforced by ClientLayout only
        // when the user is navigating to their OWN starship.
        router.push(addWelcome(`/ship/${starship.slug}`))
      } else {
        router.push('/account')
      }

      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      handleError(error, 'useLogin')
    },
  })
}

// Register mutation
export function useRegister() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { handleError } = useSimpleError()

  return useMutation({
    mutationFn: async ({ email, password, name }: { email: string; password: string; name?: string }) => {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, displayName: name }),
      })

      const data = await response.json()

      if (!response.ok || !data.data) {
        throw new Error(data.error?.message || 'Registration failed')
      }

      return data.data as AuthRegisterResponse
    },
    onSuccess: async data => {
      // Check if this is an email verification response
      if (data.emailVerificationSent) {
        // Email verification sent - no immediate login
        // The UI should already show the verification message
        return
      }

      const { user, token, starship } = data

      if (!user || !token) {
        handleError(new Error('We encountered an issue setting up your account. Please try refreshing the page or contact support if this persists.'), 'useRegister')
        return
      }

      // Store token
      setStoredToken(token)

      // Update auth user cache
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      // Embedded connector install flow should remain on the install page and let the UI advance.
      if (isConnectorInstallPath(typeof window !== 'undefined' ? window.location.pathname : null)) {
        queryClient.invalidateQueries()
        return
      }

      const didHandleAutomate = await handleAutomatePostAuth({ token, starship, queryClient, router })
      if (didHandleAutomate) {
        return
      }

      const redirectTarget = getPostAuthRedirectTarget()

      if (redirectTarget) {
        router.push(redirectTarget)
      } else if (starship?.slug) {
        // Always route into the starship; onboarding is enforced by ClientLayout only
        // when the user is navigating to their OWN starship.
        router.push(`/ship/${starship.slug}`)
      }

      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      handleError(error, 'useRegister')
    },
  })
}

// OAuth login mutation - SECURE authorization code exchange
export function useOAuthLogin() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { handleError } = useSimpleError()

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
    onSuccess: async data => {
      const { user, token, starship, isFirstLogin } = data

      if (!user || !token) {
        handleError(new Error('We encountered an issue loading your account. Please try refreshing the page or contact support if this persists.'), 'useOAuthLogin')
        return
      }

      // Store token (same as regular login)
      setStoredToken(token)

      // Update auth user cache (same as regular login)
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)

      // If OAuth exchange is happening on an install flow, the /login page should redirect via returnUrl.
      // If we still somehow land on /connectors/*/install, stay put and let the UI advance.
      if (isConnectorInstallPath(typeof window !== 'undefined' ? window.location.pathname : null)) {
        queryClient.invalidateQueries()
        return
      }

      const didHandleLeadGen = await handleLeadGenPostAuth({
        token,
        starship,
        isFirstLogin,
        queryClient,
        router,
      })
      if (didHandleLeadGen) {
        return
      }

      const didHandleAutomate = await handleAutomatePostAuth({ token, starship, queryClient, router })
      if (didHandleAutomate) {
        return
      }

      const redirectTarget = getPostAuthRedirectTarget()
      const addWelcome = (p: string) => (isFirstLogin ? addWelcomeParamToPath(p) : p)
      if (redirectTarget) {
        router.push(addWelcome(redirectTarget))
      } else if (starship?.slug) {
        // Always route into the starship; onboarding is enforced by ClientLayout only
        // when the user is navigating to their OWN starship.
        router.push(addWelcome(`/ship/${starship.slug}`))
      } else {
        router.push('/account')
      }

      queryClient.invalidateQueries()
    },
    onError: (error: any) => {
      handleError(error, 'useOAuthLogin')
    },
  })
}

// Resend verification mutation
export function useResendVerification() {
  const { handleError } = useSimpleError()

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
      handleError(error, 'useResendVerification')
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
    onSuccess: data => {
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
        if (process.env.NODE_ENV === 'development') {
          console.error('[AUTH-Logout-API]', error)
        }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('[AUTH-Logout]', error)
      }
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
  const oauthLogin = useCallback(
    async (authCode: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await oauthLoginMutation.mutateAsync({ authCode })
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message || 'OAuth login failed' }
      }
    },
    [oauthLoginMutation]
  )

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
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ newPassword, confirmPassword }),
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

    // Instance admin capabilities
    isInstanceAdmin: !!user?.isInstanceAdmin,

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
