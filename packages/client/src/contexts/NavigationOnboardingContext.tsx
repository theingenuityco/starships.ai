'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useNavigationOnboarding } from '@/hooks/useNavigationOnboarding'

interface NavigationOnboardingContextValue {
  shouldShowOnboarding: boolean
  hasCompletedOnboarding: boolean
  currentStep: number | null
  currentStepInfo: ReturnType<typeof useNavigationOnboarding>['currentStepInfo']
  totalSteps: number
  startOnboarding: () => void
  nextStep: () => void
  previousStep: () => void
  isCompleting: boolean
}

const NavigationOnboardingContext = createContext<NavigationOnboardingContextValue | null>(null)

export function NavigationOnboardingProvider({ children }: { children: ReactNode }) {
  const onboarding = useNavigationOnboarding()

  return <NavigationOnboardingContext.Provider value={onboarding}>{children}</NavigationOnboardingContext.Provider>
}

export function useNavigationOnboardingContext() {
  const context = useContext(NavigationOnboardingContext)
  if (!context) {
    throw new Error('useNavigationOnboardingContext must be used within NavigationOnboardingProvider')
  }
  return context
}
