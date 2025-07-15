import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ProximityState } from '@/hooks/useProximityDetection';
import { starshipAPI, visionAPI, type Starship } from '@/lib/api';

interface CommandDeckState {
  visibility: 'collapsed' | 'partial' | 'expanded';
  proximityState: ProximityState;
  lastInteraction: Date;
  hasFocus: boolean;
  isHovered: boolean;
}

interface StarshipState {
  // API-backed starship data
  starships: Starship[];
  activeStarshipId: string | null;
  loading: boolean;
  error: string | null;
  
  // Command deck state (preserved)
  commandDeck: CommandDeckState;
  
  // SIMPLIFIED VISION STATE (BREAKING CHANGE)
  vision: string;  // CHANGED: was complex object with statement, confidence, lastUpdated
  visionLoading: boolean;
  visionError: string | null;
  
  // Legacy fields for backward compatibility (derived from active starship)
  get class(): 'scout' | 'cruiser';
  get powerLevel(): number;
  get activeExpeditions(): number;
  get sibilInsights(): number;
  currentRoute: string;
}

interface StarshipActions {
  // API actions
  loadUserStarships: () => Promise<void>;
  createStarship: (data: { name: string; class: 'scout' | 'cruiser' }) => Promise<void>;
  setActiveStarship: (starshipId: string | null) => void;
  deployAgent: (agentId: string) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  
  // SIMPLIFIED VISION ACTIONS (BREAKING CHANGE)
  loadVision: (starshipId: string) => Promise<void>;
  saveVision: (starshipId: string, vision: string) => Promise<void>;
  
  // Command deck actions (preserved)
  setCommandDeckVisibility: (visibility: CommandDeckState['visibility']) => void;
  updateProximityState: (proximityState: ProximityState) => void;
  expandCommandDeck: () => void;
  collapseCommandDeck: () => void;
  setCommandDeckFocus: (hasFocus: boolean) => void;
  setCommandDeckHover: (isHovered: boolean) => void;
  
  // Legacy actions for backward compatibility
  updateVision: (statement: string) => void;
  navigateTo: (route: string) => void;
}

export const useStarshipStore = create<StarshipState & StarshipActions>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        starships: [],
        activeStarshipId: null,
        loading: false,
        error: null,
        currentRoute: '/',
        
        commandDeck: {
          visibility: 'collapsed',
          proximityState: 'far',
          lastInteraction: new Date(),
          hasFocus: false,
          isHovered: false
        },
        
        // SIMPLIFIED VISION STATE
        vision: '',  // CHANGED: was complex object
        visionLoading: false,
        visionError: null,

        // Computed properties for backward compatibility
        get class() {
          try {
            const state = get();
            if (!state || !state.starships) return 'scout';
            const activeStarship = state.starships.find(s => s.id === state.activeStarshipId);
            return activeStarship?.class || 'scout';
          } catch {
            return 'scout';
          }
        },
        
        get powerLevel() {
          try {
            const state = get();
            if (!state || !state.starships) return 85;
            const activeStarship = state.starships.find(s => s.id === state.activeStarshipId);
            return activeStarship?.powerLevel || 85;
          } catch {
            return 85;
          }
        },
        
        get activeExpeditions() {
          try {
            const state = get();
            if (!state || !state.starships) return 0;
            const activeStarship = state.starships.find(s => s.id === state.activeStarshipId);
            return activeStarship?.activeExpeditions || 0;
          } catch {
            return 0;
          }
        },
        
        get sibilInsights() {
          try {
            const state = get();
            if (!state || !state.starships) return 0;
            const activeStarship = state.starships.find(s => s.id === state.activeStarshipId);
            return activeStarship?.sibilInsights || 0;
          } catch {
            return 0;
          }
        },

        // API Actions
        loadUserStarships: async () => {
          set({ loading: true, error: null });
          try {
            const response = await starshipAPI.getUserStarships();
            const starships = response.starships;
            
            set({
              starships,
              loading: false,
              // Auto-select first starship if none selected and starships exist
              activeStarshipId: get().activeStarshipId || (starships.length > 0 ? starships[0].id : null)
            });
            
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to load starships',
              loading: false
            });
          }
        },

        createStarship: async (data) => {
          set({ loading: true, error: null });
          try {
            const response = await starshipAPI.createStarship(data);
            const newStarships = [...get().starships, response.starship];
            
            set({
              starships: newStarships,
              activeStarshipId: response.starship.id,
              loading: false,
              vision: ''
            });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to create starship',
              loading: false
            });
          }
        },

        setActiveStarship: (starshipId) => {
          set({ activeStarshipId: starshipId });
        },

        deployAgent: async (agentId) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          try {
            await starshipAPI.deployAgent(activeStarshipId, agentId);
          } catch (error) {
            console.error('Failed to deploy agent:', error);
            set({ error: 'Failed to deploy agent' });
          }
        },

        removeAgent: async (agentId) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          try {
            await starshipAPI.removeAgent(activeStarshipId, agentId);
          } catch (error) {
            console.error('Failed to remove agent:', error);
            set({ error: 'Failed to remove agent' });
          }
        },


        // SIMPLIFIED VISION ACTIONS (CRITICAL: BYPASS DATABASE)
        loadVision: async (starshipId: string) => {
          set({ visionLoading: true, visionError: null });
          try {
            const data = await visionAPI.get(starshipId);
            set({ vision: data.vision || '', visionLoading: false });
          } catch (error) {
            set({ visionError: 'Failed to load vision', visionLoading: false });
          }
        },
        
        saveVision: async (starshipId: string, vision: string) => {
          set({ visionLoading: true, visionError: null });
          try {
            await visionAPI.save(starshipId, vision);
            set({ vision, visionLoading: false });
          } catch (error) {
            set({ visionError: 'Failed to save vision', visionLoading: false });
          }
        },

        // Command deck actions (preserved)
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

        // Legacy actions for backward compatibility
        updateVision: (statement) => {
          set({ vision: statement });
        },

        navigateTo: (route) =>
          set({ currentRoute: route }, false, 'navigation/navigate')
      }),
      {
        name: 'starship-store',
        partialize: (state) => ({
          activeStarshipId: state.activeStarshipId,
          currentRoute: state.currentRoute,
          // Don't persist starships array - reload from API
          // Don't persist command deck state - should reset on reload
        })
      }
    ),
    {
      name: 'starship-store'
    }
  )
);