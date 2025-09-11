import api from '@/lib/api'
import type { ApiResponse, CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Workflow category type for filtering
export type WorkflowCategory = 'general' | 'data-processing' | 'automation' | 'integration' | 'analysis'
export type ExecutionMode = 'simple' | 'workflow'
export type StarshipClass = 'scout' | 'cruiser'

// Workflow filters interface
export interface WorkflowFilters {
  category?: WorkflowCategory
  authorId?: string
  starshipId?: string
  isPublic?: boolean
  tags?: string[]
  starshipClass?: StarshipClass
}

// Workflow analytics interface
export interface WorkflowAnalytics {
  workflowId: string
  usageStats: {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    averageExecutionTime: number
  }
  popularityScore: number
  lastExecuted?: string
}

// Centralized query keys with hierarchical structure
export const WORKFLOW_QUERY_KEYS = {
  all: ['workflows'] as const,
  lists: () => [...WORKFLOW_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: WorkflowFilters) => [...WORKFLOW_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...WORKFLOW_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...WORKFLOW_QUERY_KEYS.details(), id] as const,
  byCategory: (category: WorkflowCategory) => [...WORKFLOW_QUERY_KEYS.all, 'category', category] as const,
  byAuthor: (authorId: string) => [...WORKFLOW_QUERY_KEYS.all, 'author', authorId] as const,
  byStarship: (starshipId: string) => [...WORKFLOW_QUERY_KEYS.all, 'starship', starshipId] as const,
  public: (limit?: number) => [...WORKFLOW_QUERY_KEYS.all, 'public', { limit }] as const,
  search: (query: string) => [...WORKFLOW_QUERY_KEYS.all, 'search', query] as const,
  analytics: (id: string) => [...WORKFLOW_QUERY_KEYS.detail(id), 'analytics'] as const,
} as const

// Get all workflows with optional filtering
export function useWorkflows(filters?: WorkflowFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.list(filters),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const params = new URLSearchParams()
      if (filters?.category) params.append('category', filters.category)
      if (filters?.authorId) params.append('authorId', filters.authorId)
      if (filters?.starshipId) params.append('starshipId', filters.starshipId)
      if (filters?.isPublic !== undefined) params.append('isPublic', filters.isPublic.toString())
      if (filters?.tags) params.append('tags', filters.tags.join(','))
      if (filters?.starshipClass) params.append('starshipClass', filters.starshipClass)

      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.get(`/api/v1/workflows?${params.toString()}`)
      return { workflows: response.data.data }
    },
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

// Get workflow by ID
export function useWorkflow(workflowId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.detail(workflowId),
    queryFn: async (): Promise<WorkflowModel> => {
      const response: FetchResponse<ApiResponse<WorkflowModel>> = await api.get(`/api/v1/workflows/${workflowId}`)
      return response.data.data
    },
    enabled: !!workflowId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get workflows by category
export function useWorkflowsByCategory(category: WorkflowCategory, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.byCategory(category),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.get(`/api/v1/workflows/category/${category}`)
      return { workflows: response.data.data }
    },
    enabled: !!category && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Get workflows by author
export function useWorkflowsByAuthor(authorId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.byAuthor(authorId),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.get(`/api/v1/workflows/author/${authorId}`)
      return { workflows: response.data.data }
    },
    enabled: !!authorId && enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Get workflows by starship
export function useWorkflowsByStarship(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.get(`/api/v1/starships/${starshipId}/workflows`)
      return { workflows: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get public workflows
export function usePublicWorkflows(limit: number = 50, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.public(limit),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.get(`/api/v1/workflows/public?limit=${limit}`)
      return { workflows: response.data.data }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })
}

// Search workflows
export function useSearchWorkflows(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.search(query),
    queryFn: async (): Promise<{ workflows: WorkflowModel[] }> => {
      const response: FetchResponse<ApiResponse<WorkflowModel[]>> = await api.post('/api/v1/workflows/search', { query })
      return { workflows: response.data.data }
    },
    enabled: !!query && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get workflow analytics
export function useWorkflowAnalytics(workflowId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WORKFLOW_QUERY_KEYS.analytics(workflowId),
    queryFn: async (): Promise<WorkflowAnalytics> => {
      const response: FetchResponse<ApiResponse<WorkflowAnalytics>> = await api.get(`/api/v1/workflows/${workflowId}/analytics`)
      return response.data.data
    },
    enabled: !!workflowId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Create a new workflow
export function useCreateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWorkflowRequest): Promise<WorkflowModel> => {
      const response: FetchResponse<ApiResponse<WorkflowModel>> = await api.post('/api/v1/workflows', data)
      return response.data.data
    },
    onMutate: async newWorkflow => {
      // Cancel any outgoing refetches for workflow lists
      await queryClient.cancelQueries({ queryKey: WORKFLOW_QUERY_KEYS.lists() })

      // Snapshot the previous workflow lists
      const previousWorkflows = queryClient.getQueryData(WORKFLOW_QUERY_KEYS.list())

      // Optimistically add new workflow to the general list
      const optimisticWorkflow = {
        id: `temp-${Date.now()}`,
        ...newWorkflow,
        authorId: 'temp-author', // Will be set properly by the server
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        version: '1.0.0',
        isPublic: newWorkflow.isPublic ?? false,
        tags: newWorkflow.tags || [],
        executionMode: newWorkflow.executionMode || 'workflow',
        category: newWorkflow.category || 'general',
        blueprint: newWorkflow.blueprint || { nodes: [], edges: [], metadata: {} },
        timeout: newWorkflow.timeout || 30000,
        creating: true, // Add a flag to show loading state
      } as WorkflowModel & { creating?: boolean }

      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.list(), (old: { workflows: WorkflowModel[] } | undefined) => {
        const workflows = old?.workflows || []
        return { workflows: [optimisticWorkflow, ...workflows] }
      })

      return { previousWorkflows, optimisticWorkflow }
    },
    onSuccess: (workflow, variables, context) => {
      // Replace optimistic update with real data
      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.list(), (old: { workflows: WorkflowModel[] } | undefined) => {
        const workflows = old?.workflows || []
        const withoutOptimistic = workflows.filter(w => w.id !== context?.optimisticWorkflow.id)
        return { workflows: [workflow, ...withoutOptimistic] }
      })

      // Add to category-specific cache
      if (workflow.category) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byCategory(workflow.category as WorkflowCategory), (old: { workflows: WorkflowModel[] } | undefined) => {
          const workflows = old?.workflows || []
          return { workflows: [workflow, ...workflows] }
        })
      }

      // Add to author-specific cache
      if (workflow.authorId) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byAuthor(workflow.authorId), (old: { workflows: WorkflowModel[] } | undefined) => {
          const workflows = old?.workflows || []
          return { workflows: [workflow, ...workflows] }
        })
      }

      // Set individual workflow cache
      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.detail(workflow.id), workflow)

      toast.success('Workflow created successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousWorkflows) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.list(), context.previousWorkflows)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create workflow'
      toast.error('Failed to create workflow', {
        description: errorMessage,
      })
    },
  })
}

// Update workflow
export function useUpdateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workflowId, updates }: { workflowId: string; updates: UpdateWorkflowRequest }): Promise<WorkflowModel> => {
      const response: FetchResponse<ApiResponse<WorkflowModel>> = await api.put(`/api/v1/workflows/${workflowId}`, updates)
      return response.data.data
    },
    onMutate: async ({ workflowId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: WORKFLOW_QUERY_KEYS.detail(workflowId) })

      // Snapshot the previous workflow data
      const previousWorkflow = queryClient.getQueryData(WORKFLOW_QUERY_KEYS.detail(workflowId))

      // Optimistically update the workflow
      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.detail(workflowId), (old: WorkflowModel | undefined) => {
        if (!old) return old
        return {
          ...old,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      })

      return { previousWorkflow, workflowId }
    },
    onSuccess: (updatedWorkflow, variables) => {
      // Update all caches with the real data
      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.detail(variables.workflowId), updatedWorkflow)

      // Update lists
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.byCategory(updatedWorkflow.category as WorkflowCategory) })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.byAuthor(updatedWorkflow.authorId) })

      toast.success('Workflow updated successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousWorkflow) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.detail(context.workflowId), context.previousWorkflow)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update workflow'
      toast.error('Failed to update workflow', {
        description: errorMessage,
      })
    },
  })
}

// Delete workflow
export function useDeleteWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/workflows/${workflowId}`)
      return response.data.data
    },
    onMutate: async workflowId => {
      // Get workflow details before deletion for rollback
      const workflow = queryClient.getQueryData(WORKFLOW_QUERY_KEYS.detail(workflowId)) as WorkflowModel

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: WORKFLOW_QUERY_KEYS.lists() })

      // Snapshot previous data
      const previousWorkflows = queryClient.getQueryData(WORKFLOW_QUERY_KEYS.list())
      const previousCategoryWorkflows = workflow?.category ? queryClient.getQueryData(WORKFLOW_QUERY_KEYS.byCategory(workflow.category as WorkflowCategory)) : null
      const previousAuthorWorkflows = workflow?.authorId ? queryClient.getQueryData(WORKFLOW_QUERY_KEYS.byAuthor(workflow.authorId)) : null

      // Optimistically remove from lists
      queryClient.setQueryData(WORKFLOW_QUERY_KEYS.list(), (old: { workflows: WorkflowModel[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          workflows: old.workflows.filter(w => w.id !== workflowId),
        }
      })

      if (workflow?.category) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byCategory(workflow.category as WorkflowCategory), (old: { workflows: WorkflowModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            workflows: old.workflows.filter(w => w.id !== workflowId),
          }
        })
      }

      if (workflow?.authorId) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byAuthor(workflow.authorId), (old: { workflows: WorkflowModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            workflows: old.workflows.filter(w => w.id !== workflowId),
          }
        })
      }

      return { previousWorkflows, previousCategoryWorkflows, previousAuthorWorkflows, workflow, workflowId }
    },
    onError: (error: any, workflowId, context) => {
      // Rollback optimistic updates
      if (context?.previousWorkflows) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.list(), context.previousWorkflows)
      }
      if (context?.previousCategoryWorkflows && context.workflow?.category) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byCategory(context.workflow.category as WorkflowCategory), context.previousCategoryWorkflows)
      }
      if (context?.previousAuthorWorkflows && context.workflow?.authorId) {
        queryClient.setQueryData(WORKFLOW_QUERY_KEYS.byAuthor(context.workflow.authorId), context.previousAuthorWorkflows)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete workflow'
      toast.error('Failed to delete workflow', {
        description: errorMessage,
      })
    },
    onSuccess: (data, workflowId, context) => {
      // Remove from all caches
      queryClient.removeQueries({ queryKey: WORKFLOW_QUERY_KEYS.detail(workflowId) })
      queryClient.removeQueries({ queryKey: WORKFLOW_QUERY_KEYS.analytics(workflowId) })

      toast.success('Workflow deleted successfully!')
    },
    onSettled: (data, error, workflowId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.public() })
    },
  })
}

// Deploy workflow to starship
export function useDeployWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workflowId, starshipId }: { workflowId: string; starshipId: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/workflows/${workflowId}/deploy`, { starshipId })
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // Invalidate workflow details to show updated deployment status
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.detail(variables.workflowId) })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.byStarship(variables.starshipId) })

      toast.success('Workflow deployed successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to deploy workflow'
      toast.error('Failed to deploy workflow', {
        description: errorMessage,
      })
    },
  })
}

// Track workflow usage
export function useTrackWorkflowUsage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/workflows/${workflowId}/track-usage`)
      return response.data.data
    },
    onSuccess: (data, workflowId) => {
      // Invalidate related queries to show updated usage
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.detail(workflowId) })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.analytics(workflowId) })
      queryClient.invalidateQueries({ queryKey: WORKFLOW_QUERY_KEYS.public() })
    },
    onError: (error: any) => {
      // Silent error for usage tracking - don't show error toast as it's not critical
      console.warn('Failed to track workflow usage:', error)
    },
  })
}

// Utility hook for managing active workflow selection with local storage
export function useActiveWorkflow() {
  const setActiveWorkflow = (workflowId: string | null) => {
    if (workflowId) {
      localStorage.setItem('activeWorkflowId', workflowId)
    } else {
      localStorage.removeItem('activeWorkflowId')
    }
  }

  const getActiveWorkflowId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeWorkflowId')
    }
    return null
  }

  return {
    setActiveWorkflow,
    getActiveWorkflowId,
    clearActiveWorkflow: () => setActiveWorkflow(null),
  }
}
