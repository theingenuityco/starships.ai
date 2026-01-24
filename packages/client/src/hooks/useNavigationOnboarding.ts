'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import api, { type FetchResponse } from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const TOTAL_STEPS = 5

export interface OnboardingStep {
  step: number
  route: string
  label: string
  description: string
  icon: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 1,
    route: '/marketplace',
    label: 'Explore Agents',
    description: 'Find new agents that match your needs and deploy them to your starship.',
    icon: 'store',
  },
  {
    step: 2,
    route: '/connectors', // This will be replaced with actual starship slug
    label: 'Connectors',
    description: 'Connect your apps for agents to interact with them.',
    icon: 'plug',
  },
  {
    step: 3,
    route: '/agents', // This will be replaced with actual starship slug
    label: 'My Agents',
    description: 'View and manage your deployed agents.',
    icon: 'bot',
  },
  {
    step: 4,
    route: '/schedules', // This will be replaced with actual starship slug
    label: 'Schedules',
    description: 'Automate agents to run tasks at a specific time and date.',
    icon: 'clock',
  },
  {
    step: 5,
    route: '/conversations', // This will be replaced with actual starship slug
    label: 'New Chat',
    description: 'Click here anytime to start a new conversation.',
    icon: 'plus',
  },
]

/**
 * Hook to manage navigation onboarding state
 */
export function useNavigationOnboarding() {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [hasCompletedLocally, setHasCompletedLocally] = useState(false)

  // Check if user has completed onboarding (either from server or locally)
  const hasCompletedOnboarding = hasCompletedLocally || (user?.navigationOnboardingCompleted ?? false)

  // Check if onboarding should be shown
  const shouldShowOnboarding = isAuthenticated && !hasCompletedOnboarding

  // Mutation to mark onboarding as completed
  const completeOnboardingMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const response: FetchResponse<ApiResponse<any>> = await api.post('/api/v1/users/me/onboarding/navigation/complete')
      return response.data.data
    },
    onSuccess: async () => {
      // Immediately mark as completed locally to prevent restart
      setHasCompletedLocally(true)
      setCurrentStep(null)
      
      // Invalidate and refetch user query to refresh user data
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      await queryClient.refetchQueries({ queryKey: ['auth', 'me'] })
      
      // Redirect to Explore Agents after completion
      router.push('/marketplace')
    },
  })

  // Start onboarding
  const startOnboarding = useCallback(() => {
    // Don't start if we're completing or have completed locally
    if (shouldShowOnboarding && !hasCompletedLocally && !completeOnboardingMutation.isPending) {
      setCurrentStep(1)
    }
  }, [shouldShowOnboarding, hasCompletedLocally, completeOnboardingMutation.isPending])

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
