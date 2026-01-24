'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import api, { type FetchResponse } from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useState, useCallback } from 'react'

const TOTAL_STEPS = 5

export interface OnboardingStep {
  step: number
  route: string
  label: string
  description: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 1,
    route: '/marketplace',
    label: 'Explore Agents',
    description: 'Browse and discover AI agents from the marketplace. Find agents that match your needs and deploy them to your starship.',
  },
  {
    step: 2,
    route: '/connectors', // This will be replaced with actual starship slug
    label: 'Connectors',
    description: 'Connect your favorite tools and services. Connectors allow your agents to interact with external APIs and data sources.',
  },
  {
    step: 3,
    route: '/agents', // This will be replaced with actual starship slug
    label: 'My Agents',
    description: 'Manage your deployed agents. View, configure, and customize the AI agents that power your starship.',
  },
  {
    step: 4,
    route: '/schedules', // This will be replaced with actual starship slug
    label: 'Schedules',
    description: 'Set up automated tasks and workflows. Schedule agents to run at specific times or intervals.',
  },
  {
    step: 5,
    route: '/conversations', // This will be replaced with actual starship slug
    label: 'New Chat',
    description: 'Start a new conversation with your agents. Click here anytime to begin a fresh chat session.',
  },
]

/**
 * Hook to manage navigation onboarding state
 */
export function useNavigationOnboarding() {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<number | null>(null)

  // Check if user has completed onboarding
  const hasCompletedOnboarding = user?.navigationOnboardingCompleted ?? false

  // Check if onboarding should be shown
  const shouldShowOnboarding = isAuthenticated && !hasCompletedOnboarding

  // Mutation to mark onboarding as completed
  const completeOnboardingMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const response: FetchResponse<ApiResponse<any>> = await api.post('/api/v1/users/me/onboarding/navigation/complete')
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate user query to refresh user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      setCurrentStep(null)
    },
  })

  // Start onboarding
  const startOnboarding = useCallback(() => {
    if (shouldShowOnboarding) {
      setCurrentStep(1)
    }
  }, [shouldShowOnboarding])

  // Go to next step
  const nextStep = useCallback(() => {
    if (currentStep === null) return
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1)
    } else {
      // Complete onboarding on final step
      completeOnboardingMutation.mutate()
    }
  }, [currentStep, completeOnboardingMutation])

  // Go to previous step
  const previousStep = useCallback(() => {
    if (currentStep === null || currentStep <= 1) return
    setCurrentStep(currentStep - 1)
  }, [currentStep])

  // Get current step info
  const currentStepInfo = currentStep ? ONBOARDING_STEPS[currentStep - 1] : null

  return {
    shouldShowOnboarding,
    hasCompletedOnboarding,
    currentStep,
    currentStepInfo,
    totalSteps: TOTAL_STEPS,
    startOnboarding,
    nextStep,
    previousStep,
    isCompleting: completeOnboardingMutation.isPending,
  }
}
