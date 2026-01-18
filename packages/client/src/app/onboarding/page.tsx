'use client'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'

export default function OnboardingRoute(): React.JSX.Element {
  return (
    <JwtAuthGate>
      <OnboardingPage />
    </JwtAuthGate>
  )
}

