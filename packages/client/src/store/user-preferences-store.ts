'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type UserPreferencesState = {
  expertMode: boolean
  setExpertMode: (enabled: boolean) => void
  toggleExpertMode: () => void
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    set => ({
      expertMode: false,
      setExpertMode: (enabled: boolean) => set({ expertMode: enabled }, false, 'prefs/setExpertMode'),
      toggleExpertMode: () => set(s => ({ expertMode: !s.expertMode }), false, 'prefs/toggleExpertMode'),
    }),
    {
      name: 'user-preferences',
      version: 1,
    }
  )
)

