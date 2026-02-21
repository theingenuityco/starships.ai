'use client'

import { EmailChangeToastHandler } from '@/components/global/EmailChangeToastHandler'
import { NotificationSoundBootstrap } from '@/components/global/NotificationSoundBootstrap'
import { Suspense } from 'react'

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full">
      <NotificationSoundBootstrap />
      <Suspense fallback={null}>
        <EmailChangeToastHandler />
      </Suspense>
      {children}
    </div>
  )
}

