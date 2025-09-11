/**
 * Mission Client Hooks - Layer 6
 *
 * Provides React hooks for client-side mission data management with caching and state synchronization.
 * Follows the layered architecture pattern established by useConversations.ts and useUsers.ts.
 */

import api from '@/lib/api'
import type { ApiResponse, CreateMissionRequest, MissionFilters, MissionModel, MissionSort, UpdateMissionRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Extended Mission interface for client compatibility with optimistic updates
export interface ClientMission extends MissionModel {
  loading?: boolean
  error?: boolean
  updating?: boolean
}

// Mission statistics interface
export interface MissionStats {
  total: number
  byStatus: Record<'draft' | 'active' | 'completed' | 'failed' | 'cancelled', number>
  recentMissions: MissionModel[]
}

// Mission clarity interface
export interface MissionClarity {
  id: string
  missionId: string
  objectiveClarity: number
  successMetrics: number
  timelineDefinition: number
  scopeBoundaries: number
  overallScore: number
  reasoning: string
  iteration: number
  createdAt: string
  updatedAt: string
}

// Centralized query keys following TanStack Query best practices
export const MISSION_QUERY_KEYS = {
  all: ['missions'] as const,
  lists: () => [...MISSION_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: MissionFilters, sort?: MissionSort) => [...MISSION_QUERY_KEYS.lists(), { filters, sort }] as const,
  details: () => [...MISSION_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...MISSION_QUERY_KEYS.details(), id] as const,
  byStarship: (starshipId: string, filters?: MissionFilters, sort?: MissionSort) => [...MISSION_QUERY_KEYS.all, 'starship', starshipId, { filters, sort }] as const,
  stats: (starshipId: string) => [...MISSION_QUERY_KEYS.all, 'stats', starshipId] as const,
  clarity: (missionId: string) => [...MISSION_QUERY_KEYS.detail(missionId), 'clarity'] as const,
  workflow: (missionId: string) => [...MISSION_QUERY_KEYS.detail(missionId), 'workflow'] as const,
} as const

/**
 * Get mission by ID
 */
export function useMission(missionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.detail(missionId),
    queryFn: async (): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.get(`/api/v1/missions/${missionId}`)
      return response.data.data
    },
    enabled: !!missionId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })
}

/**
 * Get missions by starship
 */
export function useStarshipMissions(starshipId: string, filters?: MissionFilters, sort?: MissionSort, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.byStarship(starshipId, filters, sort),
    queryFn: async (): Promise<MissionModel[]> => {
      const response: FetchResponse<ApiResponse<MissionModel[]>> = await api.get(`/api/v1/starships/${starshipId}/missions`, {
        params: { ...filters, ...sort },
      })
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get all missions with filters and sorting
 */
export function useMissions(filters?: MissionFilters, sort?: MissionSort, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.list(filters, sort),
    queryFn: async (): Promise<MissionModel[]> => {
      const response: FetchResponse<ApiResponse<MissionModel[]>> = await api.get('/api/v1/missions', {
        params: { ...filters, ...sort },
      })
      return response.data.data
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get mission statistics for a starship
 */
export function useMissionStats(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.stats(starshipId),
    queryFn: async (): Promise<MissionStats> => {
      const response: FetchResponse<ApiResponse<MissionStats>> = await api.get(`/api/v1/starships/${starshipId}/missions/stats`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })
}

/**
 * Get mission clarity assessment
 */
export function useMissionClarity(missionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.clarity(missionId),
    queryFn: async (): Promise<MissionClarity> => {
      const response: FetchResponse<ApiResponse<MissionClarity>> = await api.get(`/api/v1/missions/${missionId}/clarity`)
      return response.data.data
    },
    enabled: !!missionId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 1, // Only retry once since clarity might not exist
  })
}

/**
 * Get mission workflow
 */
export function useMissionWorkflow(missionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MISSION_QUERY_KEYS.workflow(missionId),
    queryFn: async (): Promise<any> => {
      const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/missions/${missionId}/workflow`)
      return response.data.data
    },
    enabled: !!missionId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, // Only retry once since workflow might not exist
  })
}

/**
 * Create a new mission
 */
export function useCreateMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateMissionRequest): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.post('/api/v1/missions', data)
      return response.data.data
    },
    onSuccess: (mission, variables) => {
      // Add mission to starship cache
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(variables.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [mission]
        return [mission, ...old] // Add to beginning for newest-first ordering
      })

      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: MISSION_QUERY_KEYS.lists(),
      })

      queryClient.invalidateQueries({
        queryKey: MISSION_QUERY_KEYS.stats(variables.starshipId),
      })

      toast.success('Mission created successfully!', {
        description: `${mission.name} has been created and is ready to begin.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create mission'
      toast.error('Failed to create mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update mission
 */
export function useUpdateMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ missionId, updates }: { missionId: string; updates: UpdateMissionRequest }): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.put(`/api/v1/missions/${missionId}`, updates)
      return response.data.data
    },
    onMutate: async ({ missionId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: MISSION_QUERY_KEYS.detail(missionId) })

      // Snapshot previous value
      const previousMission = queryClient.getQueryData(MISSION_QUERY_KEYS.detail(missionId))

      // Optimistically update
      if (previousMission) {
        queryClient.setQueryData(MISSION_QUERY_KEYS.detail(missionId), (old: MissionModel | undefined) => {
          if (!old) return old
          return {
            ...old,
            ...updates,
            updatedAt: new Date().toISOString(),
            updating: true,
          } as ClientMission
        })
      }

      return { previousMission, missionId }
    },
    onSuccess: (updatedMission, variables) => {
      // Update mission in cache
      queryClient.setQueryData(MISSION_QUERY_KEYS.detail(variables.missionId), updatedMission)

      // Update mission in starship lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(updatedMission.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === variables.missionId ? updatedMission : mission))
      })

      // Update mission in all lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.lists(), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === variables.missionId ? updatedMission : mission))
      })

      // Invalidate stats if status changed
      if (variables.updates.status) {
        queryClient.invalidateQueries({
          queryKey: MISSION_QUERY_KEYS.stats(updatedMission.starshipId),
        })
      }

      toast.success('Mission updated successfully!', {
        description: `${updatedMission.name} has been updated.`,
      })
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousMission) {
        queryClient.setQueryData(MISSION_QUERY_KEYS.detail(variables.missionId), context.previousMission)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update mission'
      toast.error('Failed to update mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete mission
 */
export function useDeleteMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (missionId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/missions/${missionId}`)
      return response.data.data
    },
    onMutate: async missionId => {
      // Get mission details for cleanup
      const mission = queryClient.getQueryData(MISSION_QUERY_KEYS.detail(missionId)) as MissionModel | undefined

      if (mission) {
        // Optimistically remove from starship cache
        queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(mission.starshipId), (old: MissionModel[] | undefined) => {
          if (!old) return old
          return old.filter(m => m.id !== missionId)
        })

        // Optimistically remove from all lists
        queryClient.setQueryData(MISSION_QUERY_KEYS.lists(), (old: MissionModel[] | undefined) => {
          if (!old) return old
          return old.filter(m => m.id !== missionId)
        })
      }

      return { mission }
    },
    onSuccess: (data, missionId, context) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: MISSION_QUERY_KEYS.detail(missionId) })

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: MISSION_QUERY_KEYS.lists() })

      if (context?.mission) {
        queryClient.invalidateQueries({
          queryKey: MISSION_QUERY_KEYS.stats(context.mission.starshipId),
        })

        toast.success('Mission deleted successfully!', {
          description: `${context.mission.name} has been removed.`,
        })
      } else {
        toast.success('Mission deleted successfully!')
      }
    },
    onError: (error: any, missionId, context) => {
      // Rollback optimistic deletions
      if (context?.mission) {
        queryClient.invalidateQueries({
          queryKey: MISSION_QUERY_KEYS.byStarship(context.mission.starshipId),
        })
        queryClient.invalidateQueries({ queryKey: MISSION_QUERY_KEYS.lists() })
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete mission'
      toast.error('Failed to delete mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Start mission (change status from draft to active)
 */
export function useStartMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (missionId: string): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.post(`/api/v1/missions/${missionId}/start`)
      return response.data.data
    },
    onSuccess: (updatedMission, missionId) => {
      // Update caches
      queryClient.setQueryData(MISSION_QUERY_KEYS.detail(missionId), updatedMission)

      // Update lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(updatedMission.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === missionId ? updatedMission : mission))
      })

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: MISSION_QUERY_KEYS.stats(updatedMission.starshipId),
      })

      toast.success('Mission started!', {
        description: `${updatedMission.name} is now active.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to start mission'
      toast.error('Failed to start mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Complete mission (change status to completed)
 */
export function useCompleteMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (missionId: string): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.post(`/api/v1/missions/${missionId}/complete`)
      return response.data.data
    },
    onSuccess: (updatedMission, missionId) => {
      // Update caches
      queryClient.setQueryData(MISSION_QUERY_KEYS.detail(missionId), updatedMission)

      // Update lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(updatedMission.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === missionId ? updatedMission : mission))
      })

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: MISSION_QUERY_KEYS.stats(updatedMission.starshipId),
      })

      toast.success('Mission completed!', {
        description: `${updatedMission.name} has been successfully completed.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to complete mission'
      toast.error('Failed to complete mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Cancel mission
 */
export function useCancelMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (missionId: string): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.post(`/api/v1/missions/${missionId}/cancel`)
      return response.data.data
    },
    onSuccess: (updatedMission, missionId) => {
      // Update caches
      queryClient.setQueryData(MISSION_QUERY_KEYS.detail(missionId), updatedMission)

      // Update lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(updatedMission.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === missionId ? updatedMission : mission))
      })

      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: MISSION_QUERY_KEYS.stats(updatedMission.starshipId),
      })

      toast.success('Mission cancelled', {
        description: `${updatedMission.name} has been cancelled.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to cancel mission'
      toast.error('Failed to cancel mission', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update mission phase
 */
export function useUpdateMissionPhase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ missionId, phase }: { missionId: string; phase: 'welcome' | 'analysis' | 'plan' | 'execute' | 'converse' }): Promise<MissionModel> => {
      const response: FetchResponse<ApiResponse<MissionModel>> = await api.put(`/api/v1/missions/${missionId}/phase`, { phase })
      return response.data.data
    },
    onSuccess: (updatedMission, variables) => {
      // Update caches
      queryClient.setQueryData(MISSION_QUERY_KEYS.detail(variables.missionId), updatedMission)

      // Update lists
      queryClient.setQueryData(MISSION_QUERY_KEYS.byStarship(updatedMission.starshipId), (old: MissionModel[] | undefined) => {
        if (!old) return [updatedMission]
        return old.map(mission => (mission.id === variables.missionId ? updatedMission : mission))
      })

      toast.success('Mission phase updated!', {
        description: `${updatedMission.name} is now in ${variables.phase} phase.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update mission phase'
      toast.error('Failed to update mission phase', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update workflow approval
 */
export function useUpdateWorkflowApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ missionId, approvalStatus, rejectionReason }: { missionId: string; approvalStatus: 'approved' | 'rejected'; rejectionReason?: string }): Promise<any> => {
      const response: FetchResponse<ApiResponse<any>> = await api.put(`/api/v1/missions/${missionId}/workflow/approval`, {
        approvalStatus,
        rejectionReason,
      })
      return response.data.data
    },
    onSuccess: (result, variables) => {
      // Invalidate mission and workflow caches
      queryClient.invalidateQueries({ queryKey: MISSION_QUERY_KEYS.detail(variables.missionId) })
      queryClient.invalidateQueries({ queryKey: MISSION_QUERY_KEYS.workflow(variables.missionId) })

      const status = variables.approvalStatus === 'approved' ? 'approved' : 'rejected'
      toast.success(`Workflow ${status}!`, {
        description: `The mission workflow has been ${status}.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update workflow approval'
      toast.error('Failed to update workflow approval', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Utility hook for mission status helpers
 */
export function useMissionHelpers() {
  const getStatusColor = (status: MissionModel['status']): string => {
    switch (status) {
      case 'draft':
        return 'gray'
      case 'active':
        return 'blue'
      case 'completed':
        return 'green'
      case 'failed':
        return 'red'
      case 'cancelled':
        return 'orange'
      default:
        return 'gray'
    }
  }

  const getPhaseColor = (phase: MissionModel['phase']): string => {
    switch (phase) {
      case 'welcome':
        return 'purple'
      case 'analysis':
        return 'yellow'
      case 'plan':
        return 'blue'
      case 'execute':
        return 'green'
      case 'converse':
        return 'indigo'
      default:
        return 'gray'
    }
  }

  const canTransitionTo = (currentStatus: MissionModel['status'], newStatus: MissionModel['status']): boolean => {
    const validTransitions: Record<MissionModel['status'], MissionModel['status'][]> = {
      draft: ['active', 'cancelled'],
      active: ['completed', 'failed', 'cancelled'],
      completed: [],
      failed: ['active'],
      cancelled: ['draft'],
    }

    return validTransitions[currentStatus]?.includes(newStatus) || false
  }

  return {
    getStatusColor,
    getPhaseColor,
    canTransitionTo,
  }
}
