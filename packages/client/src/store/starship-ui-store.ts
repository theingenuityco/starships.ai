import React from 'react';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ProximityState } from '@/hooks/useProximityDetection';

interface CommandDeckState {
  visibility: 'collapsed' | 'partial' | 'expanded';
  proximityState: ProximityState;
  lastInteraction: Date;
  hasFocus: boolean;
  isHovered: boolean;
}

interface StarshipUIState {
  // UI-only state
  activeStarshipId: string | null;
  currentRoute: string;
  commandDeck: CommandDeckState;
  
  // UI actions
  setActiveStarship: (id: string | null) => void;
  navigateTo: (route: string) => void;
  
  // Command deck actions
  setCommandDeckVisibility: (visibility: CommandDeckState['visibility']) => void;
  updateProximityState: (proximityState: ProximityState) => void;
  expandCommandDeck: () => void;
  collapseCommandDeck: () => void;
  setCommandDeckFocus: (hasFocus: boolean) => void;
  setCommandDeckHover: (isHovered: boolean) => void;
}

export const useStarshipUIStore = create<StarshipUIState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        activeStarshipId: null,
        currentRoute: '/',
        commandDeck: {
          visibility: 'collapsed',
          proximityState: 'far',
          lastInteraction: new Date(),
          hasFocus: false,
          isHovered: false
        },

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

        // Command deck actions
        setCommandDeckVisibility: (visibility) =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              visibility,
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/setVisibility'),

        updateProximityState: (proximityState) =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              proximityState,
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/updateProximity'),

        expandCommandDeck: () =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              visibility: 'expanded',
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/expand'),

        collapseCommandDeck: () =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              visibility: 'collapsed',
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/collapse'),

        setCommandDeckFocus: (hasFocus) =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              hasFocus,
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/setFocus'),

        setCommandDeckHover: (isHovered) =>
          set((state) => ({
            commandDeck: {
              ...state.commandDeck,
              isHovered,
              lastInteraction: new Date()
            }
          }), false, 'commandDeck/setHover'),
      }),
      {
        name: 'starship-ui-store',
        partialize: (state) => ({
          activeStarshipId: state.activeStarshipId,
          currentRoute: state.currentRoute,
          // Don't persist command deck state - should reset on reload
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

// For backward compatibility, export a hook that provides the legacy interface
export function useStarshipStore() {
  console.warn('useStarshipStore is deprecated. Use TanStack Query hooks from @/hooks/useStarships instead for data operations, and useStarshipUIStore for UI state.');
  
  const uiStore = useStarshipUIStore();
  
  // Return a compatible interface that directs users to the new hooks
  return {
    ...uiStore,
    // Deprecated fields - return sensible defaults
    starships: [],
    loading: false,
    error: null,
    // Deprecated methods - log warnings
    loadUserStarships: () => {
      console.warn('loadUserStarships is deprecated. Use useStarships() hook from @/hooks/useStarships instead.');
      return Promise.resolve();
    },
    createStarship: () => {
      console.warn('createStarship is deprecated. Use useCreateStarship() hook from @/hooks/useStarships instead.');
      return Promise.resolve({} as any);
    },
    updateStarship: () => {
      console.warn('updateStarship is deprecated. Use useUpdateStarship() hook from @/hooks/useStarships instead.');
      return Promise.resolve();
    },
    deleteStarship: () => {
      console.warn('deleteStarship is deprecated. Use useDeleteStarship() hook from @/hooks/useStarships instead.');
      return Promise.resolve();
    },
  };
}