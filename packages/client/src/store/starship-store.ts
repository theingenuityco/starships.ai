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

interface StarshipState {
  // Existing state (migrated from React Context)
  class: 'scout' | 'cruiser';
  powerLevel: number;
  activeExpeditions: number;
  sibilInsights: number;
  currentRoute: string;
  
  // New command deck state
  commandDeck: CommandDeckState;
  
  // Vision/consciousness state
  vision: {
    statement: string;
    lastUpdated: Date;
    confidence: number;
  };
}

interface StarshipActions {
  // Command deck actions
  setCommandDeckVisibility: (visibility: CommandDeckState['visibility']) => void;
  updateProximityState: (proximityState: ProximityState) => void;
  expandCommandDeck: () => void;
  collapseCommandDeck: () => void;
  setCommandDeckFocus: (hasFocus: boolean) => void;
  setCommandDeckHover: (isHovered: boolean) => void;
  
  // Existing actions (migrated)
  updateVision: (statement: string) => void;
  navigateTo: (route: string) => void;
}

export const useStarshipStore = create<StarshipState & StarshipActions>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 2,
        sibilInsights: 7,
        currentRoute: '/',
        
        commandDeck: {
          visibility: 'collapsed',
          proximityState: 'far',
          lastInteraction: new Date(),
          hasFocus: false,
          isHovered: false
        },
        
        vision: {
          statement: '',
          lastUpdated: new Date(),
          confidence: 0
        },

        // Actions
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

        updateVision: (statement) =>
          set((state) => ({
            vision: {
              statement,
              lastUpdated: new Date(),
              confidence: Math.min(100, Math.max(0, statement.length * 2))
            }
          }), false, 'vision/update'),

        navigateTo: (route) =>
          set((state) => ({
            currentRoute: route
          }), false, 'navigation/navigate')
      }),
      {
        name: 'starship-store',
        partialize: (state) => ({
          class: state.class,
          powerLevel: state.powerLevel,
          vision: state.vision,
          // Don't persist command deck state - should reset on reload
        })
      }
    ),
    {
      name: 'starship-store'
    }
  )
); 