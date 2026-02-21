'use client'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { EmailChangeToastHandler } from '@/components/global/EmailChangeToastHandler'
import { NotificationSoundBootstrap } from '@/components/global/NotificationSoundBootstrap'
import { StarTheme } from '@/components/theme-context'
import { Suspense } from 'react'

export default function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <JwtAuthGate>
      <StarTheme>
        <NotificationSoundBootstrap />
        <Suspense fallback={null}>
          <EmailChangeToastHandler />
        </Suspense>
        <div className="relative min-h-[100dvh] w-full overflow-auto bg-background">
          <main className="relative min-h-full w-full">{children}</main>
        </div>
      </StarTheme>
    </JwtAuthGate>
  )
}

