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
      setExpertMode: (enabled: boolean) => set({ expertMode: enabled }),
      toggleExpertMode: () => set(s => ({ expertMode: !s.expertMode })),
    }),
    {
      name: 'user-preferences',
      version: 1,
    }
  )
)

