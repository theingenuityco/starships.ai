import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { starshipAPI, type Starship, type UpdateStarshipRequest } from '@/lib/api';

// Centralized query keys
export const STARSHIP_QUERY_KEYS = {
  all: ['starships'] as const,
  lists: () => [...STARSHIP_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: any) => [...STARSHIP_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...STARSHIP_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...STARSHIP_QUERY_KEYS.details(), id] as const,
  agents: (id: string) => [...STARSHIP_QUERY_KEYS.detail(id), 'agents'] as const,
  bySlug: (slug: string) => [...STARSHIP_QUERY_KEYS.all, 'slug', slug] as const,
} as const;

// Get all user starships
export function useStarships() {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.list(),
    queryFn: async () => {
      const response = await starshipAPI.getUserStarships();
      return response;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}

// Get starship by ID or slug
export function useStarship(idOrSlug: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.detail(idOrSlug),
    queryFn: async () => {
      const response = await starshipAPI.getStarship(idOrSlug);
      return response;
    },
    enabled: !!idOrSlug && enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get starship agents
export function useStarshipAgents(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.agents(starshipId),
    queryFn: async () => {
      const response = await starshipAPI.getStarshipAgents(starshipId);
      return response;
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Create starship mutation
export function useCreateStarship() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      class: 'scout' | 'cruiser' | 'draught';
    }) => {
      const response = await starshipAPI.createStarship(data);
      return response;
    },
    onSuccess: (data) => {
      // Invalidate and refetch starships list
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
      
      // Add new starship to cache optimistically
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), (old: any) => {
        if (!old) return { starships: [data.starship] };
        return {
          ...old,
          starships: [...old.starships, data.starship]
        };
      });

      toast.success('Starship created successfully!', {
        description: `${data.starship.name} is ready for missions.`
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create starship';
      toast.error('Failed to create starship', {
        description: errorMessage
      });
    }
  });
}

// Update starship mutation
export function useUpdateStarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateStarshipRequest }) => {
      const response = await starshipAPI.updateStarship(id, updates);
      return response;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
      await queryClient.cancelQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(id) });

      // Snapshot the previous values
      const previousStarships = queryClient.getQueryData(STARSHIP_QUERY_KEYS.list());
      const previousStarship = queryClient.getQueryData(STARSHIP_QUERY_KEYS.detail(id));

      // Optimistically update the cache
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), (old: any) => {
        if (!old?.starships) return old;
        return {
          ...old,
          starships: old.starships.map((starship: Starship) =>
            starship.id === id ? { ...starship, ...updates } : starship
          ),
        };
      });

      queryClient.setQueryData(STARSHIP_QUERY_KEYS.detail(id), (old: any) => {
        if (!old?.starship) return old;
        return {
          ...old,
          starship: { ...old.starship, ...updates },
        };
      });

      return { previousStarships, previousStarship, id };
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic updates
      if (context?.previousStarships) {
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), context.previousStarships);
      }
      if (context?.previousStarship) {
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.detail(context.id), context.previousStarship);
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update starship';
      toast.error('Failed to update starship', {
        description: errorMessage
      });
    },
    onSuccess: (data) => {
      toast.success('Starship updated successfully!');
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(variables.id) });
    },
  });
}

// Delete starship mutation
export function useDeleteStarship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await starshipAPI.deleteStarship(id);
      return response;
    },
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });

      // Snapshot the previous value
      const previousStarships = queryClient.getQueryData(STARSHIP_QUERY_KEYS.list());

      // Optimistically remove the starship
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), (old: any) => {
        if (!old?.starships) return old;
        return {
          ...old,
          starships: old.starships.filter((starship: Starship) => starship.id !== id),
        };
      });

      return { previousStarships, id };
    },
    onError: (error: any, id, context) => {
      // Rollback the optimistic update
      if (context?.previousStarships) {
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), context.previousStarships);
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete starship';
      toast.error('Failed to delete starship', {
        description: errorMessage
      });
    },
    onSuccess: (data, id) => {
      // Remove the specific starship from all caches
      queryClient.removeQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(id) });
      queryClient.removeQueries({ queryKey: STARSHIP_QUERY_KEYS.agents(id) });

      toast.success('Starship deleted successfully!', {
        description: data.subscriptionCancelled ? 'Subscription has been cancelled.' : undefined
      });
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
    },
  });
}

// Update starship status mutation
export function useUpdateStarshipStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' }) => {
      const response = await starshipAPI.updateStarshipStatus(id, status);
      return response;
    },
    onMutate: async ({ id, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
      await queryClient.cancelQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(id) });

      // Snapshot the previous values
      const previousStarships = queryClient.getQueryData(STARSHIP_QUERY_KEYS.list());
      const previousStarship = queryClient.getQueryData(STARSHIP_QUERY_KEYS.detail(id));

      // Optimistically update the status
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), (old: any) => {
        if (!old?.starships) return old;
        return {
          ...old,
          starships: old.starships.map((starship: Starship) =>
            starship.id === id ? { ...starship, status } : starship
          ),
        };
      });

      queryClient.setQueryData(STARSHIP_QUERY_KEYS.detail(id), (old: any) => {
        if (!old?.starship) return old;
        return {
          ...old,
          starship: { ...old.starship, status },
        };
      });

      return { previousStarships, previousStarship, id };
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic updates
      if (context?.previousStarships) {
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.list(), context.previousStarships);
      }
      if (context?.previousStarship) {
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.detail(context.id), context.previousStarship);
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update starship status';
      toast.error('Failed to update starship status', {
        description: errorMessage
      });
    },
    onSuccess: (data, variables) => {
      toast.success(`Starship status updated to ${variables.status}!`);
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(variables.id) });
    },
  });
}

// Deploy agent to starship mutation
export function useDeployAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ starshipId, agentId }: { starshipId: string; agentId: string }) => {
      const response = await starshipAPI.deployAgent(starshipId, agentId);
      return response;
    },
    onSuccess: (data, variables) => {
      // Invalidate starship agents to refetch
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.agents(variables.starshipId) });
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(variables.starshipId) });

      toast.success('Agent deployed successfully!');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to deploy agent';
      toast.error('Failed to deploy agent', {
        description: errorMessage
      });
    },
  });
}

// Remove agent from starship mutation
export function useRemoveAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ starshipId, agentId }: { starshipId: string; agentId: string }) => {
      const response = await starshipAPI.removeAgent(starshipId, agentId);
      return response;
    },
    onSuccess: (data, variables) => {
      // Invalidate starship agents to refetch
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.agents(variables.starshipId) });
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(variables.starshipId) });

      toast.success('Agent removed successfully!');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to remove agent';
      toast.error('Failed to remove agent', {
        description: errorMessage
      });
    },
  });
}

// Hook to get starship by slug with automatic loading
export function useStarshipBySlug(slug: string) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.bySlug(slug),
    queryFn: async () => {
      const response = await starshipAPI.getStarshipBySlug(slug);
      return response;
    },
    enabled: !!slug,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Utility hook for managing active starship selection with local storage
export function useActiveStarship() {
  const queryClient = useQueryClient();
  
  const setActiveStarship = (starshipId: string | null) => {
    if (starshipId) {
      localStorage.setItem('activeStarshipId', starshipId);
    } else {
      localStorage.removeItem('activeStarshipId');
    }
  };

  const getActiveStarshipId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeStarshipId');
    }
    return null;
  };

  return {
    setActiveStarship,
    getActiveStarshipId,
    clearActiveStarship: () => setActiveStarship(null),
  };
}