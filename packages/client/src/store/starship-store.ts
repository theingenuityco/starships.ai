import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ProximityState } from '@/hooks/useProximityDetection';
import { starshipAPI, visionAPI, type Starship } from '@/lib/api';
import { extractErrorMessage } from '@/lib/error-utils';

// Define types locally based on protocol package
interface UpdateStarshipRequest {
  name?: string;
  status?: 'active' | 'inactive';
  class?: 'scout' | 'cruiser' | 'draught';
}

interface UpdateStarshipStatusRequest {
  status: 'active' | 'inactive';
}

interface StarshipAgentsResponse {
  starshipId: string;
  starshipName: string;
  starshipClass: 'scout' | 'cruiser' | 'draught';
  maxAgents: number;
  deployedAgents: Array<{
    id: string;
    name: string;
    model: string;
    systemPrompt?: string;
    createdAt: string;
    description?: string;
    tags: string[];
    category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
    authorId: string;
    isPublic: boolean;
    version: string;
    updatedAt: string;
    usageCount: number;
    rating?: number;
    temperature?: number;
    maxTokens?: number;
    customInstructions?: string;
    allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
    requiredPermissions?: string[];
  }>;
  availableSlots: number;
  deployedCount: number;
}

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
  
  // Enhanced loading states for different operations
  loading: boolean;
  loadingStarships: boolean;
  loadingUpdate: boolean;
  loadingDelete: boolean;
  loadingStatusUpdate: boolean;
  loadingAgents: boolean;
  
  // Enhanced error handling
  error: string | null;
  updateError: string | null;
  deleteError: string | null;
  statusUpdateError: string | null;
  agentsError: string | null;
  
  // Agent data cache
  starshipAgents: Record<string, StarshipAgentsResponse>;
  
  // Command deck state (preserved)
  commandDeck: CommandDeckState;
  
  // Vision state (restored to complex object)
  vision: {
    statement: string;
    confidence: number;
    lastUpdated: string;
  };
  visionLoading: boolean;
  visionError: string | null;
  
  // Legacy fields for backward compatibility (derived from active starship)
  get class(): 'scout' | 'cruiser' | 'draught';
  get powerLevel(): number;
  get sibilInsights(): number;
  currentRoute: string;
}

interface StarshipActions {
  // Existing API actions
  loadUserStarships: () => Promise<void>;
  createStarship: (data: {
    name: string;
    class: 'scout' | 'cruiser' | 'draught';
    vision?: {
      statement: string;
      confidence?: number;
      sibilSessionId?: string;
    };
  }) => Promise<{ id: string; slug: string; ownerId: string; class: 'scout' | 'cruiser' | 'draught'; name: string; maxAgents: number; status: 'active' | 'inactive' | 'disabled' | 'restricted' | 'pending_payment'; createdAt: string; updatedAt: string; plan?: 'scout' | 'cruiser' | 'draught'; subscriptionId?: string; billingPeriod?: 'monthly' | 'yearly'; }>;
  deployAgent: (agentId: string) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  
  // NEW: Enhanced CRUD operations
  updateStarship: (id: string, updates: UpdateStarshipRequest) => Promise<void>;
  deleteStarship: (id: string) => Promise<void>;
  updateStarshipStatus: (id: string, status: UpdateStarshipStatusRequest['status']) => Promise<void>;
  getStarshipAgents: (id: string) => Promise<void>;
  
  // NEW: Slug-based operations
  getStarshipBySlug: (slug: string) => Promise<Starship | null>;
  setActiveStarshipBySlug: (slug: string) => Promise<void>;
  
  // Error clearing actions
  clearErrors: () => void;
  clearError: (errorType: 'update' | 'delete' | 'status' | 'agents') => void;
  
  // Vision actions (restored to complex object)
  loadVision: (starshipId: string) => Promise<void>;
  saveVision: (starshipId: string, statement: string, confidence?: number) => Promise<void>;
  
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
        
        // Enhanced loading states
        loading: false,
        loadingStarships: false,
        loadingUpdate: false,
        loadingDelete: false,
        loadingStatusUpdate: false,
        loadingAgents: false,
        
        // Enhanced error handling
        error: null,
        updateError: null,
        deleteError: null,
        statusUpdateError: null,
        agentsError: null,
        
        // Agent data cache
        starshipAgents: {},
        
        currentRoute: '/',
        
        commandDeck: {
          visibility: 'collapsed',
          proximityState: 'far',
          lastInteraction: new Date(),
          hasFocus: false,
          isHovered: false
        },
        
        // Vision state (restored to complex object)
        vision: {
          statement: '',
          confidence: 0.8,
          lastUpdated: new Date().toISOString()
        },
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
            return 85; // Default power level since powerLevel doesn't exist on Starship
          } catch {
            return 85;
          }
        },
        
        
        get sibilInsights() {
          try {
            const state = get();
            if (!state || !state.starships) return 0;
            const activeStarship = state.starships.find(s => s.id === state.activeStarshipId);
            return 0; // Default sibil insights since sibilInsights doesn't exist on Starship
          } catch {
            return 0;
          }
        },

        // API Actions
        loadUserStarships: async () => {
          set({ loadingStarships: true, loading: true, error: null });
          try {
            const response = await starshipAPI.getUserStarships();
            const starships = response.starships;
            
            set({
              starships,
              loadingStarships: false,
              loading: false,
              // Auto-select first starship if none selected and starships exist
              activeStarshipId: get().activeStarshipId || (starships.length > 0 ? starships[0].id : null)
            });
            
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to load starships',
              loadingStarships: false,
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
                confidence: 0.8,
                lastUpdated: new Date().toISOString()
              }
            });
            
            // Return the created starship for navigation
            return response.starship;
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to create starship',
              loading: false
            });
            throw error;
          }
        },

        deployAgent: async (agentId) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          set({ loadingAgents: true, agentsError: null });
          try {
            await starshipAPI.deployAgent(activeStarshipId, agentId);
            // Refresh agent data after deployment
            const response = await starshipAPI.getStarshipAgents(activeStarshipId);
            const currentAgents = get().starshipAgents;
            set({
              starshipAgents: { ...currentAgents, [activeStarshipId]: response },
              loadingAgents: false
            });
          } catch (error) {
            console.error('Failed to deploy agent:', error);
            set({
              agentsError: error instanceof Error ? error.message : 'Failed to deploy agent',
              loadingAgents: false
            });
          }
        },

        removeAgent: async (agentId) => {
          const activeStarshipId = get().activeStarshipId;
          if (!activeStarshipId) return;

          set({ loadingAgents: true, agentsError: null });
          try {
            await starshipAPI.removeAgent(activeStarshipId, agentId);
            // Refresh agent data after removal
            const response = await starshipAPI.getStarshipAgents(activeStarshipId);
            const currentAgents = get().starshipAgents;
            set({
              starshipAgents: { ...currentAgents, [activeStarshipId]: response },
              loadingAgents: false
            });
          } catch (error) {
            console.error('Failed to remove agent:', error);
            set({
              agentsError: error instanceof Error ? error.message : 'Failed to remove agent',
              loadingAgents: false
            });
          }
        },

        // NEW: Enhanced CRUD operations
        updateStarship: async (id, updates) => {
          set({ loadingUpdate: true, updateError: null });
          try {
            const response = await starshipAPI.updateStarship(id, updates);
            const updatedStarship = response.starship;
            
            // Update starship in the array
            const currentStarships = get().starships;
            const updatedStarships = currentStarships.map(s =>
              s.id === id ? { ...s, ...updatedStarship } : s
            );
            
            set({
              starships: updatedStarships,
              loadingUpdate: false
            });
          } catch (error) {
            set({
              updateError: error instanceof Error ? error.message : 'Failed to update starship',
              loadingUpdate: false
            });
          }
        },

        deleteStarship: async (id) => {
          set({ loadingDelete: true, deleteError: null });
          try {
            const response = await starshipAPI.deleteStarship(id);
            
            // Remove starship from the array
            const currentStarships = get().starships;
            const updatedStarships = currentStarships.filter(s => s.id !== id);
            
            set({
              starships: updatedStarships,
              loadingDelete: false,
              // If we deleted the active starship, clear the selection
              activeStarshipId: get().activeStarshipId === id ? null : get().activeStarshipId
            });
            
            // Log subscription cancellation status for debugging
            if (response.subscriptionCancelled) {
              console.log('[STARSHIP] Subscription cancelled successfully for starship:', id);
            }
            
            // Note: cancellationError property doesn't exist in response type
            // Log subscription cancellation details if available
            console.log('[STARSHIP] Subscription cancellation details:', response);
          } catch (error: any) {
            // Use centralized error handling
            const fullError = extractErrorMessage(error, 'Failed to delete starship');
            
            set({
              deleteError: fullError,
              loadingDelete: false
            });
            
            // Don't remove the starship from the list if deletion failed
            console.error('[STARSHIP] Delete failed:', fullError);
          }
        },

        updateStarshipStatus: async (id, status) => {
          set({ loadingStatusUpdate: true, statusUpdateError: null });
          try {
            const response = await starshipAPI.updateStarshipStatus(id, status);
            const updatedStarship = response.starship;
            
            // Update starship status in the array
            const currentStarships = get().starships;
            const updatedStarships = currentStarships.map(s =>
              s.id === id ? { ...s, status: updatedStarship.status } : s
            );
            
            set({
              starships: updatedStarships,
              loadingStatusUpdate: false
            });
          } catch (error) {
            set({
              statusUpdateError: error instanceof Error ? error.message : 'Failed to update starship status',
              loadingStatusUpdate: false
            });
          }
        },

        getStarshipAgents: async (id) => {
          set({ loadingAgents: true, agentsError: null });
          try {
            const response = await starshipAPI.getStarshipAgents(id);
            
            // Cache the agents data
            const currentAgents = get().starshipAgents;
            set({
              starshipAgents: { ...currentAgents, [id]: response },
              loadingAgents: false
            });
          } catch (error) {
            set({
              agentsError: error instanceof Error ? error.message : 'Failed to load starship agents',
              loadingAgents: false
            });
          }
        },

        // Error clearing actions
        clearErrors: () => {
          set({
            error: null,
            updateError: null,
            deleteError: null,
            statusUpdateError: null,
            agentsError: null,
            visionError: null
          });
        },

        clearError: (errorType) => {
          switch (errorType) {
            case 'update':
              set({ updateError: null });
              break;
            case 'delete':
              set({ deleteError: null });
              break;
            case 'status':
              set({ statusUpdateError: null });
              break;
            case 'agents':
              set({ agentsError: null });
              break;
          }
        },

        // NEW: Slug-based operations
        getStarshipBySlug: async (slug: string): Promise<Starship | null> => {
          const starships = get().starships;
          return starships.find(s => s.slug === slug) || null;
        },

        setActiveStarshipBySlug: async (slug: string): Promise<void> => {
          const starship = await get().getStarshipBySlug(slug);
          if (starship) {
            set({ activeStarshipId: starship.id });
          }
        },

        // Vision actions (restored to complex object)
        loadVision: async (starshipId: string) => {
          set({ visionLoading: true, visionError: null });
          try {
            const data = await visionAPI.get(starshipId);
            set({
              vision: {
                statement: typeof data.vision === 'string' ? data.vision : '',
                confidence: 0.8,
                lastUpdated: new Date().toISOString()
              },
              visionLoading: false
            });
          } catch (error) {
            set({ visionError: 'Failed to load vision', visionLoading: false });
          }
        },
        
        saveVision: async (starshipId: string, statement: string, confidence?: number) => {
          set({ visionLoading: true, visionError: null });
          try {
            await visionAPI.save(starshipId, statement);
            set({
              vision: {
                statement,
                confidence: confidence || 0.8,
                lastUpdated: new Date().toISOString()
              },
              visionLoading: false
            });
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
          set({
            vision: {
              statement,
              confidence: get().vision.confidence,
              lastUpdated: new Date().toISOString()
            }
          });
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