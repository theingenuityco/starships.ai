import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ProximityState } from '@/hooks/useProximityDetection';
import { starshipAPI, type Starship, type CodexProjection } from '@/lib/api';
import type { Goal, Constraint, PendingChange, GoalFormData, ConstraintFormData } from '@/components/consciousness/VisionChamber/shared/types';

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
  
  // Vision state (now synced with API)
  vision: {
    statement: string;
    lastUpdated: Date;
    confidence: number;
  };
  
  // Goals and Constraints state (synced with API)
  goals: Goal[];
  constraints: Constraint[];
  
  // Maker-Checker Flow state
  pendingChanges: PendingChange[];
  
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
  updateVisionAPI: (statement: string) => Promise<void>;
  deployAgent: (agentId: string) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  getProjection: (lens: 'telos' | 'ethos' | 'full') => Promise<CodexProjection | null>;
  
  // Goals and Constraints actions
  loadGoalsAndConstraints: () => Promise<void>;
  createGoal: (data: GoalFormData) => Promise<void>;
  updateGoal: (id: string, changes: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  createConstraint: (data: ConstraintFormData) => Promise<void>;
  updateConstraint: (id: string, changes: Partial<Constraint>) => Promise<void>;
  deleteConstraint: (id: string) => Promise<void>;
  
  // Maker-Checker Flow actions
  queueChange: (change: Omit<PendingChange, 'id' | 'timestamp'>) => void;
  removeFromQueue: (changeId: string) => void;
  clearQueue: () => void;
  applyQueuedChanges: () => Promise<void>;
  
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
        
        vision: {
          statement: '',
          lastUpdated: new Date(),
          confidence: 0
        },
        
        // Initial goals and constraints state
        goals: [],
        constraints: [],
        pendingChanges: [],

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

            // Load vision for active starship
            const activeStarshipId = get().activeStarshipId;
            if (activeStarshipId) {
              try {
                const response = await starshipAPI.getProjection(activeStarshipId, 'telos');
                if (response.projection.vision) {
                  set({
                    vision: {
                      statement: response.projection.vision,
                      lastUpdated: new Date(),
                      confidence: Math.min(100, response.projection.vision.length * 2)
                    }
                  });
                }
              } catch (visionError) {
                console.error('Failed to load vision:', visionError);
              }
            }
            
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
              vision: {
                statement: '',
                lastUpdated: new Date(),
                confidence: 0
              }
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
          
          // Load vision for new active starship
          if (starshipId) {
            starshipAPI.getProjection(starshipId, 'telos')
              .then(response => {
                if (response.projection.vision) {
                  set({
                    vision: {
                      statement: response.projection.vision,
                      lastUpdated: new Date(),
                      confidence: Math.min(100, response.projection.vision.length * 2)
                    }
                  });
                }
              })
              .catch(error => console.error('Failed to load vision:', error));
          }
        },

        updateVisionAPI: async (statement) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          try {
            await starshipAPI.updateCodex(activeStarshipId, {
              vision: { statement }
            });
            
            set({
              vision: {
                statement,
                lastUpdated: new Date(),
                confidence: Math.min(100, statement.length * 2)
              }
            });
          } catch (error) {
            console.error('Failed to update vision:', error);
            set({ error: 'Failed to update vision' });
          }
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

        getProjection: async (lens) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return null;

          try {
            const response = await starshipAPI.getProjection(activeStarshipId, lens);
            return response.projection;
          } catch (error) {
            console.error('Failed to get projection:', error);
            return null;
          }
        },

        // Goals and Constraints actions
        loadGoalsAndConstraints: async () => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          try {
            const response = await starshipAPI.getProjection(activeStarshipId, 'full');
            if (response.projection) {
              // Map API response to our internal Goal/Constraint interfaces
              const goals: Goal[] = (response.projection.goals || []).map(g => ({
                ...g,
                status: g.status as Goal['status'], // Cast to proper union type
                codexId: 'temp', // TODO: Get actual codexId from API
                priority: 5, // TODO: Get from API or provide default
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }));
              
              const constraints: Constraint[] = (response.projection.constraints || []).map(c => ({
                ...c,
                codexId: 'temp', // TODO: Get actual codexId from API  
                severity: 'medium' as const, // TODO: Get from API or provide default
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }));
              
              set({ goals, constraints });
            }
          } catch (error) {
            console.error('Failed to load goals and constraints:', error);
            set({ error: 'Failed to load goals and constraints' });
          }
        },

        createGoal: async (data) => {
          // For now, add to pending changes queue
          // Future: Direct API call when backend supports it
          const changeId = `goal_create_${Date.now()}`;
          get().queueChange({
            type: 'goal',
            operation: 'create',
            target: 'new',
            changes: data,
            after: data,
            source: 'user'
          });
        },

        updateGoal: async (id, changes) => {
          const existingGoal = get().goals.find(g => g.id === id);
          if (!existingGoal) return;

          get().queueChange({
            type: 'goal',
            operation: 'update',
            target: id,
            changes,
            before: existingGoal,
            after: { ...existingGoal, ...changes },
            source: 'user'
          });
        },

        deleteGoal: async (id) => {
          const existingGoal = get().goals.find(g => g.id === id);
          if (!existingGoal) return;

          get().queueChange({
            type: 'goal',
            operation: 'delete',
            target: id,
            changes: {},
            before: existingGoal,
            source: 'user'
          });
        },

        createConstraint: async (data) => {
          get().queueChange({
            type: 'constraint',
            operation: 'create',
            target: 'new',
            changes: data,
            after: data,
            source: 'user'
          });
        },

        updateConstraint: async (id, changes) => {
          const existingConstraint = get().constraints.find(c => c.id === id);
          if (!existingConstraint) return;

          get().queueChange({
            type: 'constraint',
            operation: 'update',
            target: id,
            changes,
            before: existingConstraint,
            after: { ...existingConstraint, ...changes },
            source: 'user'
          });
        },

        deleteConstraint: async (id) => {
          const existingConstraint = get().constraints.find(c => c.id === id);
          if (!existingConstraint) return;

          get().queueChange({
            type: 'constraint',
            operation: 'delete',
            target: id,
            changes: {},
            before: existingConstraint,
            source: 'user'
          });
        },

        // Maker-Checker Flow actions
        queueChange: (change) => {
          const changeWithId = {
            ...change,
            id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
          };

          set((state) => ({
            pendingChanges: [...state.pendingChanges, changeWithId]
          }));
        },

        removeFromQueue: (changeId) => {
          set((state) => ({
            pendingChanges: state.pendingChanges.filter(c => c.id !== changeId)
          }));
        },

        clearQueue: () => {
          set({ pendingChanges: [] });
        },

        applyQueuedChanges: async () => {
          const activeStarshipId = get().activeStarshipId;
          const changes = get().pendingChanges;
          
          if (!activeStarshipId || changes.length === 0) return;

          try {
            // Group changes by type and apply via updateCodex
            // For now, this is a placeholder - backend needs maker-checker endpoints
            console.log('Applying queued changes:', changes);
            
            // Clear queue after successful application
            get().clearQueue();
            
            // Reload data to reflect changes
            await get().loadGoalsAndConstraints();
          } catch (error) {
            console.error('Failed to apply queued changes:', error);
            set({ error: 'Failed to apply changes' });
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
          // Use API version if starship is active, otherwise local only
          const activeStarshipId = get().activeStarshipId;
          if (activeStarshipId) {
            get().updateVisionAPI(statement);
          } else {
            set({
              vision: {
                statement,
                lastUpdated: new Date(),
                confidence: Math.min(100, Math.max(0, statement.length * 2))
              }
            });
          }
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