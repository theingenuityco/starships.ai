/**
 * User Client Hooks - Layer 6
 *
 * Provides React hooks for client-side user data management with caching and state synchronization.
 * Follows the layered architecture pattern established by useConversations.ts and useAgents.ts.
 */

import api from '@/lib/api'
import type { ApiResponse, CreateUserRequest, UpdateUserRequest, UserModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Extended User interface for client compatibility with optimistic updates
export interface ClientUser extends UserModel {
  loading?: boolean
  error?: boolean
  updating?: boolean
}

// User filters for search and filtering
export interface UserFilters {
  email?: string
  username?: string
  hasStripe?: boolean
  isNewUser?: boolean
}

// User registration request
export interface RegisterUserRequest {
  email: string
  password: string
  username?: string
  displayName?: string
  name?: string // Legacy support
}

// User profile update request (includes password change)
export interface UpdateUserProfileRequest {
  username?: string
  email?: string
  displayName?: string
  avatar?: string
  currentPassword?: string
  newPassword?: string
}

// Stripe integration request
export interface LinkStripeRequest {
  stripeCustomerId: string
}

// User statistics response
export interface UserStats {
  totalUsers: number
  newUsersLast30Days: number
  activeUsers: number
  usersWithStripe: number
}

// Centralized query keys following TanStack Query best practices
export const USER_QUERY_KEYS = {
  all: ['users'] as const,
  lists: () => [...USER_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: UserFilters) => [...USER_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...USER_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...USER_QUERY_KEYS.details(), id] as const,
  byEmail: (email: string) => [...USER_QUERY_KEYS.all, 'email', email] as const,
  byUsername: (username: string) => [...USER_QUERY_KEYS.all, 'username', username] as const,
  byStripe: (stripeCustomerId: string) => [...USER_QUERY_KEYS.all, 'stripe', stripeCustomerId] as const,
  stats: () => [...USER_QUERY_KEYS.all, 'stats'] as const,
  currentUser: () => [...USER_QUERY_KEYS.all, 'current'] as const,
} as const

/**
 * Get user by ID
 */
export function useUser(userId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.detail(userId),
    queryFn: async (): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.get(`/api/v1/users/${userId}`)
      return response.data.data
    },
    enabled: !!userId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  })
}

/**
 * Get user by email
 */
export function useUserByEmail(email: string, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.byEmail(email),
    queryFn: async (): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.get(`/api/v1/users/email/${encodeURIComponent(email)}`)
      return response.data.data
    },
    enabled: !!email && email.includes('@') && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  })
}

/**
 * Get user by username
 */
export function useUserByUsername(username: string, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.byUsername(username),
    queryFn: async (): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.get(`/api/v1/users/username/${encodeURIComponent(username)}`)
      return response.data.data
    },
    enabled: !!username && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  })
}

/**
 * Get user by Stripe customer ID
 */
export function useUserByStripeId(stripeCustomerId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.byStripe(stripeCustomerId),
    queryFn: async (): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.get(`/api/v1/users/stripe/${stripeCustomerId}`)
      return response.data.data
    },
    enabled: !!stripeCustomerId && stripeCustomerId.startsWith('cus_') && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  })
}

/**
 * Get all users with pagination and filters
 */
export function useUsers(filters?: UserFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.list(filters),
    queryFn: async (): Promise<UserModel[]> => {
      const response: AxiosResponse<ApiResponse<UserModel[]>> = await api.get('/api/v1/users', {
        params: filters,
      })
      return response.data.data
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get user statistics
 */
export function useUserStats(enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.stats(),
    queryFn: async (): Promise<UserStats> => {
      const response: AxiosResponse<ApiResponse<UserStats>> = await api.get('/api/v1/users/stats')
      return response.data.data
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  })
}

/**
 * Get current authenticated user (helper hook)
 */
export function useCurrentUser(userId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: USER_QUERY_KEYS.currentUser(),
    queryFn: async (): Promise<UserModel> => {
      if (!userId) throw new Error('No user ID provided')
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.get(`/api/v1/users/${userId}`)
      return response.data.data
    },
    enabled: !!userId && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  })
}

/**
 * Register a new user
 */
export function useRegisterUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: RegisterUserRequest): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.post('/api/v1/users/register', data)
      return response.data.data
    },
    onSuccess: user => {
      // Add user to cache
      queryClient.setQueryData(USER_QUERY_KEYS.detail(user.id), user)

      // Invalidate user lists to include new user
      queryClient.invalidateQueries({
        queryKey: USER_QUERY_KEYS.lists(),
      })

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: USER_QUERY_KEYS.stats(),
      })

      toast.success('Registration successful!', {
        description: `Welcome ${user.displayName || user.username}! Your account has been created.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to register user'
      toast.error('Registration failed', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Create a new user (admin operation)
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateUserRequest): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.post('/api/v1/users', data)
      return response.data.data
    },
    onSuccess: user => {
      // Add user to cache
      queryClient.setQueryData(USER_QUERY_KEYS.detail(user.id), user)

      // Invalidate user lists
      queryClient.invalidateQueries({
        queryKey: USER_QUERY_KEYS.lists(),
      })

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: USER_QUERY_KEYS.stats(),
      })

      toast.success('User created successfully!', {
        description: `${user.displayName || user.username} has been added to the system.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create user'
      toast.error('Failed to create user', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update user profile
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: UpdateUserProfileRequest }): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.put(`/api/v1/users/${userId}/profile`, updates)
      return response.data.data
    },
    onMutate: async ({ userId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: USER_QUERY_KEYS.detail(userId) })

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData(USER_QUERY_KEYS.detail(userId))

      // Optimistically update the user
      if (previousUser) {
        queryClient.setQueryData(USER_QUERY_KEYS.detail(userId), (old: UserModel | undefined) => {
          if (!old) return old
          return {
            ...old,
            ...updates,
            updating: true,
          } as ClientUser
        })
      }

      return { previousUser, userId }
    },
    onSuccess: (updatedUser, variables) => {
      // Update the user in cache
      queryClient.setQueryData(USER_QUERY_KEYS.detail(variables.userId), updatedUser)

      // Update current user cache if it's the same user
      queryClient.setQueryData(USER_QUERY_KEYS.currentUser(), (old: UserModel | undefined) => {
        return old?.id === variables.userId ? updatedUser : old
      })

      // Update user in lists
      queryClient.setQueryData(USER_QUERY_KEYS.lists(), (old: UserModel[] | undefined) => {
        if (!old) return old
        return old.map(user => (user.id === variables.userId ? updatedUser : user))
      })

      // If email or username changed, update those caches too
      if (variables.updates.email) {
        queryClient.setQueryData(USER_QUERY_KEYS.byEmail(variables.updates.email), updatedUser)
      }
      if (variables.updates.username) {
        queryClient.setQueryData(USER_QUERY_KEYS.byUsername(variables.updates.username), updatedUser)
      }

      toast.success('Profile updated successfully!', {
        description: 'Your profile information has been saved.',
      })
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousUser) {
        queryClient.setQueryData(USER_QUERY_KEYS.detail(variables.userId), context.previousUser)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update profile'
      toast.error('Failed to update profile', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update user (admin operation)
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: UpdateUserRequest }): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.put(`/api/v1/users/${userId}`, updates)
      return response.data.data
    },
    onSuccess: (updatedUser, variables) => {
      // Update all relevant caches
      queryClient.setQueryData(USER_QUERY_KEYS.detail(variables.userId), updatedUser)

      // Invalidate lists
      queryClient.invalidateQueries({
        queryKey: USER_QUERY_KEYS.lists(),
      })

      toast.success('User updated successfully!', {
        description: `${updatedUser.displayName || updatedUser.username} has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update user'
      toast.error('Failed to update user', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.delete(`/api/v1/users/${userId}`)
      return response.data.data
    },
    onMutate: async userId => {
      // Get user details for toast
      const user = queryClient.getQueryData(USER_QUERY_KEYS.detail(userId)) as UserModel | undefined

      // Optimistically remove user from lists
      queryClient.setQueryData(USER_QUERY_KEYS.lists(), (old: UserModel[] | undefined) => {
        if (!old) return old
        return old.filter(u => u.id !== userId)
      })

      return { user }
    },
    onSuccess: (data, userId, context) => {
      // Remove user from all caches
      queryClient.removeQueries({ queryKey: USER_QUERY_KEYS.detail(userId) })

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.stats() })

      if (context?.user) {
        toast.success('User deleted successfully!', {
          description: `${context.user.displayName || context.user.username} has been removed from the system.`,
        })
      } else {
        toast.success('User deleted successfully!')
      }
    },
    onError: (error: any, userId, context) => {
      // Rollback optimistic deletion
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.lists() })

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete user'
      toast.error('Failed to delete user', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Link user to Stripe customer
 */
export function useLinkStripeCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, stripeCustomerId }: { userId: string; stripeCustomerId: string }) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.post(`/api/v1/users/${userId}/stripe`, { stripeCustomerId })
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // Invalidate user data to refetch with Stripe info
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.detail(variables.userId) })
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.currentUser() })
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.stats() })

      toast.success('Stripe account linked successfully!', {
        description: 'Your payment account has been connected.',
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to link Stripe account'
      toast.error('Failed to link Stripe account', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Authenticate user (for login)
 */
export function useAuthenticateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }): Promise<UserModel> => {
      const response: AxiosResponse<ApiResponse<UserModel>> = await api.post('/api/v1/users/authenticate', credentials)
      return response.data.data
    },
    onSuccess: user => {
      // Cache the authenticated user
      queryClient.setQueryData(USER_QUERY_KEYS.detail(user.id), user)
      queryClient.setQueryData(USER_QUERY_KEYS.currentUser(), user)

      toast.success('Welcome back!', {
        description: `Hello ${user.displayName || user.username}`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Authentication failed'
      toast.error('Login failed', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Utility hook for managing user preferences with local storage
 */
export function useUserPreferences() {
  const setUserPreference = (key: string, value: any) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`userPref_${key}`, JSON.stringify(value))
    }
  }

  const getUserPreference = (key: string, defaultValue: any = null) => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`userPref_${key}`)
      return stored ? JSON.parse(stored) : defaultValue
    }
    return defaultValue
  }

  const clearUserPreferences = () => {
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('userPref_')) {
          localStorage.removeItem(key)
        }
      })
    }
  }

  return {
    setUserPreference,
    getUserPreference,
    clearUserPreferences,
  }
}

/**
 * Utility hook for user validation helpers
 */
export function useUserValidation() {
  const validateEmail = (email: string): boolean => {
    return email.includes('@') && email.length > 0
  }

  const validateUsername = (username: string): boolean => {
    return /^[a-zA-Z0-9_-]+$/.test(username) && username.length > 0 && username.length <= 50
  }

  const validatePassword = (
    password: string
  ): {
    isValid: boolean
    errors: string[]
  } => {
    const errors: string[] = []

    if (password.length < 6) {
      errors.push('Password must be at least 6 characters long')
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  return {
    validateEmail,
    validateUsername,
    validatePassword,
  }
}
