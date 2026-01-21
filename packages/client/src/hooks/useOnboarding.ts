'use client'

import api from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ApiResponse,
  OnboardingApplySelectionRequest,
  OnboardingApplySelectionResponse,
  OnboardingAriaSuggestRequest,
  OnboardingAriaSuggestResponse,
  OnboardingRecommendationsRequest,
  OnboardingRecommendationsResponse,
  OnboardingSessionModel,
  OnboardingStartResponse,
  OnboardingFinishResponse,
} from '@starships/protocol'
import { AUTH_QUERY_KEYS, type AuthUser } from '@/hooks/useAuth'

export const ONBOARDING_QUERY_KEYS = {
  session: () => ['onboarding', 'session'] as const,
  ariaSuggest: (payload: OnboardingAriaSuggestRequest) => ['onboarding', 'ariaSuggest', payload] as const,
}

function extractData<T>(response: { data: ApiResponse<T> }): T {
  return response.data.data
}

export function useOnboardingSession() {
  return useQuery({
    queryKey: ONBOARDING_QUERY_KEYS.session(),
    queryFn: async (): Promise<{ session: OnboardingSessionModel }> => {
      const res = await api.get<ApiResponse<{ session: OnboardingSessionModel }>>('/api/v1/onboarding/session')
      return extractData(res)
    },
    retry: false,
  })
}

export function useOnboardingStart() {
  return useMutation({
    mutationFn: async (payload: { starshipName?: string }): Promise<OnboardingStartResponse> => {
      const res = await api.post<ApiResponse<OnboardingStartResponse>>('/api/v1/onboarding/start', payload)
      return extractData(res)
    },
  })
}

export function useOnboardingRecommendations() {
  return useMutation({
    mutationFn: async (payload: OnboardingRecommendationsRequest): Promise<{ session: OnboardingSessionModel } & OnboardingRecommendationsResponse> => {
      const res = await api.post<ApiResponse<{ session: OnboardingSessionModel } & OnboardingRecommendationsResponse>>('/api/v1/onboarding/recommendations', payload)
      return extractData(res)
    },
  })
}

export function useOnboardingAriaSuggest() {
  return useMutation({
    mutationFn: async (payload: OnboardingAriaSuggestRequest): Promise<OnboardingAriaSuggestResponse> => {
      const res = await api.post<ApiResponse<OnboardingAriaSuggestResponse>>('/api/v1/onboarding/aria/suggest', payload)
      return extractData(res)
    },
  })
}

export function useOnboardingApply() {
  return useMutation({
    mutationFn: async (payload: OnboardingApplySelectionRequest): Promise<OnboardingApplySelectionResponse> => {
      const res = await api.post<ApiResponse<OnboardingApplySelectionResponse>>('/api/v1/onboarding/apply', payload)
      return extractData(res)
    },
  })
}

export function useOnboardingFinish() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<OnboardingFinishResponse> => {
      const res = await api.post<ApiResponse<OnboardingFinishResponse>>('/api/v1/onboarding/finish')
      return extractData(res)
    },
    onSuccess: async () => {
      // Ensure the client immediately stops gating the user into onboarding.
      queryClient.setQueryData<AuthUser | null>(AUTH_QUERY_KEYS.me(), prev => (prev ? { ...prev, onboardingCompleted: true } : prev))
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me() })
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEYS.session() })
    },
  })
}
