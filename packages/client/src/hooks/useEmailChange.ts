/**
 * Email Change Client Hooks
 *
 * Provides React hooks for email change operations with caching and state synchronization.
 * Follows the established hook patterns from useUsers.ts.
 */

import api from '@/lib/api'
import type { ApiResponse, EmailChangeStatusResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Centralized query keys for email change operations
export const EMAIL_CHANGE_QUERY_KEYS = {
  all: ['emailChange'] as const,
  status: (userId: string) => [...EMAIL_CHANGE_QUERY_KEYS.all, 'status', userId] as const,
} as const

/**
 * Get email change status
 */
export function useEmailChangeStatus(userId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId),
    queryFn: async (): Promise<EmailChangeStatusResponse> => {
      const response: FetchResponse<ApiResponse<EmailChangeStatusResponse>> = await api.get(
        `/api/v1/users/${userId}/email/change/status`
      )
      return response.data.data
    },
    enabled: !!userId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true,
    retry: 2,
  })
}

/**
 * Initiate email change
 */
export function useInitiateEmailChange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, newEmail }: { userId: string; newEmail: string }): Promise<void> => {
      const response: FetchResponse<ApiResponse<{ message: string }>> = await api.post(
        `/api/v1/users/${userId}/email/change`,
        { newEmail }
      )
      return response.data.data
    },
    onSuccess: (_, variables) => {
      // Invalidate email change status query
      queryClient.invalidateQueries({
        queryKey: EMAIL_CHANGE_QUERY_KEYS.status(variables.userId),
      })

      toast.success('Verification email sent', {
        description: `A verification email has been sent to ${variables.newEmail}.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to initiate email change'
      toast.error('Failed to initiate email change', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Resend email change verification email
 */
export function useResendEmailChangeVerification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const response: FetchResponse<ApiResponse<{ message: string }>> = await api.post(
        `/api/v1/users/${userId}/email/change/resend`
      )
      return response.data.data
    },
    onSuccess: (_, userId) => {
      // Invalidate email change status query
      queryClient.invalidateQueries({
        queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId),
      })

      toast.success('Verification email resent', {
        description: 'A new verification email has been sent.',
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to resend verification email'
      toast.error('Failed to resend verification email', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Cancel email change
 */
export function useCancelEmailChange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const response: FetchResponse<ApiResponse<{ message: string }>> = await api.post(
        `/api/v1/users/${userId}/email/change/cancel`
      )
      return response.data.data
    },
    onSuccess: (_, userId) => {
      // Invalidate email change status query
      queryClient.invalidateQueries({
        queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId),
      })

      toast.success('Email change cancelled', {
        description: 'The email change request has been cancelled.',
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to cancel email change'
      toast.error('Failed to cancel email change', {
        description: errorMessage,
      })
    },
  })
}

