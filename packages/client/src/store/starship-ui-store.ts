import React from 'react';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface StarshipUIState {
  // UI-only state
  activeStarshipId: string | null;
  currentRoute: string;
  
  // UI actions
  setActiveStarship: (id: string | null) => void;
  navigateTo: (route: string) => void;
}

export const useStarshipUIStore = create<StarshipUIState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        activeStarshipId: null,
        currentRoute: '/',

        // UI actions
        setActiveStarship: (id: string | null) => {
          set({ activeStarshipId: id }, false, 'ui/setActiveStarship');
          
          // Also sync with localStorage for cross-tab consistency
          if (typeof window !== 'undefined') {
            if (id) {
              localStorage.setItem('activeStarshipId', id);
            } else {
              localStorage.removeItem('activeStarshipId');
            }
          }
        },

        navigateTo: (route: string) =>
          set({ currentRoute: route }, false, 'ui/navigate'),
      }),
      {
        name: 'starship-ui-store',
        partialize: (state) => ({
          activeStarshipId: state.activeStarshipId,
          currentRoute: state.currentRoute,
        })
      }
    ),
    {
      name: 'starship-ui-store'
    }
  )
);

// Utility hook to sync active starship with localStorage on hydration
export function useStarshipUIHydration() {
  const { setActiveStarship, activeStarshipId } = useStarshipUIStore();
  
  // Hydrate from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem('activeStarshipId');
      if (storedId && storedId !== activeStarshipId) {
        setActiveStarship(storedId);
      }
    }
  }, [setActiveStarship, activeStarshipId]);
}
