'use client'

import { useEffect } from 'react'
import { setupNotificationAudioUnlock } from '@/lib/notificationSound'

export function NotificationSoundBootstrap() {
  useEffect(() => {
    setupNotificationAudioUnlock()
  }, [])

  return null
}

