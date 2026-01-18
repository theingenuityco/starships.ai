'use client'

import api from '@/lib/api'
import { useMutation, useQuery } from '@tanstack/react-query'
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
    mutationFn: async (
      payload: OnboardingRecommendationsRequest
    ): Promise<{ session: OnboardingSessionModel } & OnboardingRecommendationsResponse> => {
      const res = await api.post<ApiResponse<{ session: OnboardingSessionModel } & OnboardingRecommendationsResponse>>(
        '/api/v1/onboarding/recommendations',
        payload
      )
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
  return useMutation({
    mutationFn: async (): Promise<OnboardingFinishResponse> => {
      const res = await api.post<ApiResponse<OnboardingFinishResponse>>('/api/v1/onboarding/finish')
      return extractData(res)
    },
  })
}

