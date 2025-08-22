/**
 * Enhanced Starship Store Test
 * Tests all the new CRUD operations and state management features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStarshipStore } from '../starship-store';
import { starshipAPI } from '../../lib/api';

// Mock the API
vi.mock('../../lib/api', () => ({
  starshipAPI: {
    getUserStarships: vi.fn(),
    createStarship: vi.fn(),
    updateStarship: vi.fn(),
    deleteStarship: vi.fn(),
    updateStarshipStatus: vi.fn(),
    getStarshipAgents: vi.fn(),
    deployAgent: vi.fn(),
    removeAgent: vi.fn(),
  },
  visionAPI: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

const mockStarship = {
  id: 'starship-1',
  slug: 'test-starship',
  name: 'Test Starship',
  class: 'scout' as const,
  powerLevel: 85,
  ownerId: 'user-1',
  status: 'active' as const,
  maxAgents: 3,
  sibilInsights: 0,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
};

const mockAgentsResponse = {
  starshipId: 'starship-1',
  starshipName: 'Test Starship',
  starshipClass: 'scout' as const,
  maxAgents: 3,
  deployedAgents: [
    {
      id: 'agent-1',
      name: 'Test Agent',
      model: 'gpt-4',
      createdAt: '2023-01-01T00:00:00Z',
      description: 'Test agent description',
      tags: ['test'],
      category: 'general' as const,
      authorId: 'user-1',
      isPublic: true,
      version: '1.0.0',
      updatedAt: '2023-01-01T00:00:00Z',
      usageCount: 0,
    },
  ],
  availableSlots: 2,
  deployedCount: 1,
};

describe('Enhanced Starship Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStarshipStore.setState({
      starships: [],
      activeStarshipId: null,
      loading: false,
      loadingStarships: false,
      loadingUpdate: false,
      loadingDelete: false,
      loadingStatusUpdate: false,
      loadingAgents: false,
      error: null,
      updateError: null,
      deleteError: null,
      statusUpdateError: null,
      agentsError: null,
      starshipAgents: {},
      vision: { statement: '', confidence: 0.8, lastUpdated: new Date().toISOString() },
      visionLoading: false,
      visionError: null,
      currentRoute: '/',
      commandDeck: {
        visibility: 'collapsed',
        proximityState: 'far',
        lastInteraction: new Date(),
        hasFocus: false,
        isHovered: false,
      },
    });
    vi.clearAllMocks();
  });

  describe('Enhanced CRUD Operations', () => {
    it('should update starship details', async () => {
      const mockResponse = { starship: { ...mockStarship, name: 'Updated Starship' } };
      vi.mocked(starshipAPI.updateStarship).mockResolvedValue(mockResponse);

      const store = useStarshipStore.getState();
      store.starships = [mockStarship];

      await store.updateStarship('starship-1', { name: 'Updated Starship' });

      expect(starshipAPI.updateStarship).toHaveBeenCalledWith('starship-1', {
        name: 'Updated Starship',
      });
      expect(useStarshipStore.getState().starships[0].name).toBe('Updated Starship');
      expect(useStarshipStore.getState().loadingUpdate).toBe(false);
      expect(useStarshipStore.getState().updateError).toBe(null);
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      vi.mocked(starshipAPI.updateStarship).mockRejectedValue(error);

      const store = useStarshipStore.getState();
      await store.updateStarship('starship-1', { name: 'Updated Starship' });

      expect(useStarshipStore.getState().updateError).toBe('Update failed');
      expect(useStarshipStore.getState().loadingUpdate).toBe(false);
    });

    it('should delete starship', async () => {
      vi.mocked(starshipAPI.deleteStarship).mockResolvedValue({ message: 'Deleted' });

      const store = useStarshipStore.getState();
      store.starships = [mockStarship];
      store.activeStarshipId = 'starship-1';

      await store.deleteStarship('starship-1');

      expect(starshipAPI.deleteStarship).toHaveBeenCalledWith('starship-1');
      expect(useStarshipStore.getState().starships).toHaveLength(0);
      expect(useStarshipStore.getState().activeStarshipId).toBe(null);
      expect(useStarshipStore.getState().loadingDelete).toBe(false);
    });

    it('should update starship status', async () => {
      const mockResponse = { starship: { ...mockStarship, status: 'inactive' as const } };
      vi.mocked(starshipAPI.updateStarshipStatus).mockResolvedValue(mockResponse);

      const store = useStarshipStore.getState();
      store.starships = [mockStarship];

      await store.updateStarshipStatus('starship-1', 'inactive');

      expect(starshipAPI.updateStarshipStatus).toHaveBeenCalledWith('starship-1', 'inactive');
      expect(useStarshipStore.getState().starships[0].status).toBe('inactive');
      expect(useStarshipStore.getState().loadingStatusUpdate).toBe(false);
    });

    it('should get starship agents', async () => {
      vi.mocked(starshipAPI.getStarshipAgents).mockResolvedValue(mockAgentsResponse);

      const store = useStarshipStore.getState();
      await store.getStarshipAgents('starship-1');

      expect(starshipAPI.getStarshipAgents).toHaveBeenCalledWith('starship-1');
      expect(useStarshipStore.getState().starshipAgents['starship-1']).toEqual(mockAgentsResponse);
      expect(useStarshipStore.getState().loadingAgents).toBe(false);
    });
  });

  describe('Enhanced Agent Management', () => {
    it('should deploy agent and refresh agents data', async () => {
      vi.mocked(starshipAPI.deployAgent).mockResolvedValue({ message: 'Agent deployed' });
      vi.mocked(starshipAPI.getStarshipAgents).mockResolvedValue(mockAgentsResponse);

      const store = useStarshipStore.getState();
      store.activeStarshipId = 'starship-1';

      await store.deployAgent('agent-1');

      expect(starshipAPI.deployAgent).toHaveBeenCalledWith('starship-1', 'agent-1');
      expect(starshipAPI.getStarshipAgents).toHaveBeenCalledWith('starship-1');
      expect(useStarshipStore.getState().starshipAgents['starship-1']).toEqual(mockAgentsResponse);
    });

    it('should remove agent and refresh agents data', async () => {
      vi.mocked(starshipAPI.removeAgent).mockResolvedValue({ message: 'Agent removed' });
      vi.mocked(starshipAPI.getStarshipAgents).mockResolvedValue(mockAgentsResponse);

      const store = useStarshipStore.getState();
      store.activeStarshipId = 'starship-1';

      await store.removeAgent('agent-1');

      expect(starshipAPI.removeAgent).toHaveBeenCalledWith('starship-1', 'agent-1');
      expect(starshipAPI.getStarshipAgents).toHaveBeenCalledWith('starship-1');
      expect(useStarshipStore.getState().starshipAgents['starship-1']).toEqual(mockAgentsResponse);
    });
  });

  describe('Error Management', () => {
    it('should clear all errors', () => {
      const store = useStarshipStore.getState();
      
      // Set some errors
      useStarshipStore.setState({
        error: 'General error',
        updateError: 'Update error',
        deleteError: 'Delete error',
        statusUpdateError: 'Status error',
        agentsError: 'Agents error',
        visionError: 'Vision error',
      });

      store.clearErrors();

      const state = useStarshipStore.getState();
      expect(state.error).toBe(null);
      expect(state.updateError).toBe(null);
      expect(state.deleteError).toBe(null);
      expect(state.statusUpdateError).toBe(null);
      expect(state.agentsError).toBe(null);
      expect(state.visionError).toBe(null);
    });

    it('should clear specific error types', () => {
      const store = useStarshipStore.getState();
      
      // Set some errors
      useStarshipStore.setState({
        updateError: 'Update error',
        deleteError: 'Delete error',
      });

      store.clearError('update');

      const state = useStarshipStore.getState();
      expect(state.updateError).toBe(null);
      expect(state.deleteError).toBe('Delete error'); // Should remain
    });
  });

  describe('Loading States', () => {
    it('should manage loading states for different operations', async () => {
      const store = useStarshipStore.getState();
      
      // Mock a slow API call
      vi.mocked(starshipAPI.updateStarship).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const updatePromise = store.updateStarship('starship-1', { name: 'Updated' });
      
      // Check loading state is set
      expect(useStarshipStore.getState().loadingUpdate).toBe(true);
      
      await updatePromise;
      
      // Check loading state is cleared
      expect(useStarshipStore.getState().loadingUpdate).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain legacy computed properties', () => {
      const store = useStarshipStore.getState();
      store.starships = [mockStarship];
      store.activeStarshipId = 'starship-1';

      expect(store.class).toBe('scout');
      expect(store.powerLevel).toBe(85);
      expect(store.sibilInsights).toBe(0);
    });

    it('should handle missing active starship gracefully', () => {
      const store = useStarshipStore.getState();
      store.starships = [];
      store.activeStarshipId = null;

      expect(store.class).toBe('scout'); // Default value
      expect(store.powerLevel).toBe(85); // Default value
      expect(store.sibilInsights).toBe(0); // Default value
    });
  });
});