import api from '@/lib/api'
import type { ApiResponse, CreateExecutionRequest, ExecutionModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Execution status type for filtering
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

// Execution statistics interface
export interface ExecutionStats {
  total: number
  pending: number
  running: number
  paused: number
  completed: number
  failed: number
  cancelled: number
  averageExecutionTime: number
}

// Centralized query keys with hierarchical structure
export const EXECUTION_QUERY_KEYS = {
  all: ['executions'] as const,
  lists: () => [...EXECUTION_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: { status?: ExecutionStatus; workflowId?: string }) => [...EXECUTION_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...EXECUTION_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...EXECUTION_QUERY_KEYS.details(), id] as const,
  byStatus: (status: ExecutionStatus) => [...EXECUTION_QUERY_KEYS.all, 'status', status] as const,
  byWorkflow: (workflowId: string) => [...EXECUTION_QUERY_KEYS.all, 'workflow', workflowId] as const,
  active: () => [...EXECUTION_QUERY_KEYS.all, 'active'] as const,
  stats: (workflowId?: string) => [...EXECUTION_QUERY_KEYS.all, 'stats', { workflowId }] as const,
} as const

// Get all executions with optional filtering
export function useExecutions(filters?: { status?: ExecutionStatus; workflowId?: string }, enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.list(filters),
    queryFn: async (): Promise<{ executions: ExecutionModel[] }> => {
      const params = new URLSearchParams()
      if (filters?.status) params.append('status', filters.status)
      if (filters?.workflowId) params.append('workflowId', filters.workflowId)

      const response: FetchResponse<ApiResponse<ExecutionModel[]>> = await api.get(`/api/v1/executions?${params.toString()}`)
      return { executions: response.data.data }
    },
    enabled,
    staleTime: 5 * 1000, // 5 seconds - executions change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

// Get execution by ID
export function useExecution(executionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.detail(executionId),
    queryFn: async (): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.get(`/api/v1/executions/${executionId}`)
      return response.data.data
    },
    enabled: !!executionId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
  })
}

// Get executions by status
export function useExecutionsByStatus(status: ExecutionStatus, enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.byStatus(status),
    queryFn: async (): Promise<{ executions: ExecutionModel[] }> => {
      const response: FetchResponse<ApiResponse<ExecutionModel[]>> = await api.get(`/api/v1/executions?status=${status}`)
      return { executions: response.data.data }
    },
    enabled: !!status && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get executions by workflow
export function useExecutionsByWorkflow(workflowId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.byWorkflow(workflowId),
    queryFn: async (): Promise<{ executions: ExecutionModel[] }> => {
      const response: FetchResponse<ApiResponse<ExecutionModel[]>> = await api.get(`/api/v1/workflows/${workflowId}/executions`)
      return { executions: response.data.data }
    },
    enabled: !!workflowId && enabled,
    staleTime: 15 * 1000, // 15 seconds
    gcTime: 3 * 60 * 1000, // 3 minutes
  })
}

// Get active executions
export function useActiveExecutions(enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.active(),
    queryFn: async (): Promise<{ executions: ExecutionModel[] }> => {
      const response: FetchResponse<ApiResponse<ExecutionModel[]>> = await api.get('/api/v1/executions') // Default returns active executions
      return { executions: response.data.data }
    },
    enabled,
    staleTime: 5 * 1000, // 5 seconds - very dynamic data
    gcTime: 1 * 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
    refetchInterval: 10 * 1000, // Auto-refresh every 10 seconds for active executions
  })
}

// Get execution statistics
export function useExecutionStats(workflowId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: EXECUTION_QUERY_KEYS.stats(workflowId),
    queryFn: async (): Promise<ExecutionStats> => {
      const url = workflowId ? `/api/v1/workflows/${workflowId}/executions/stats` : '/api/v1/executions/stats'
      const response: FetchResponse<ApiResponse<ExecutionStats>> = await api.get(url)
      return response.data.data
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Create a new execution
export function useCreateExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateExecutionRequest): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.post('/api/v1/executions', data)
      return response.data.data
    },
    onMutate: async newExecution => {
      // Cancel any outgoing refetches for execution lists
      await queryClient.cancelQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })

      // Snapshot the previous execution lists
      const previousExecutions = queryClient.getQueryData(EXECUTION_QUERY_KEYS.list())

      // Optimistically add new execution to the general list
      const optimisticExecution = {
        id: `temp-${Date.now()}`,
        ...newExecution,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending' as any,
        // Add required fields with defaults
        executionResults: new Map(),
        agentMemory: {},
        creating: true, // Add a flag to show loading state
      } as any

      queryClient.setQueryData(EXECUTION_QUERY_KEYS.list(), (old: { executions: ExecutionModel[] } | undefined) => {
        const executions = old?.executions || []
        return { executions: [optimisticExecution, ...executions] }
      })

      return { previousExecutions, optimisticExecution }
    },
    onSuccess: (execution, variables, context) => {
      // Replace optimistic update with real data
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.list(), (old: { executions: ExecutionModel[] } | undefined) => {
        const executions = old?.executions || []
        const withoutOptimistic = executions.filter(e => e.id !== context?.optimisticExecution.id)
        return { executions: [execution, ...withoutOptimistic] }
      })

      // Add to workflow-specific cache
      if (execution.workflowId) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.byWorkflow(execution.workflowId), (old: { executions: ExecutionModel[] } | undefined) => {
          const executions = old?.executions || []
          return { executions: [execution, ...executions] }
        })
      }

      // Set individual execution cache
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(execution.id), execution)

      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.stats() })

      toast.success('Execution created successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousExecutions) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.list(), context.previousExecutions)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create execution'
      toast.error('Failed to create execution', {
        description: errorMessage,
      })
    },
  })
}

// Update execution
export function useUpdateExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      executionId,
      updates,
    }: {
      executionId: string
      updates: Partial<ExecutionModel & { executionData?: Record<string, unknown>; result?: Record<string, unknown> }>
    }): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.put(`/api/v1/executions/${executionId}`, updates)
      return response.data.data
    },
    onMutate: async ({ executionId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: EXECUTION_QUERY_KEYS.detail(executionId) })

      // Snapshot the previous execution data
      const previousExecution = queryClient.getQueryData(EXECUTION_QUERY_KEYS.detail(executionId))

      // Optimistically update the execution
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(executionId), (old: ExecutionModel | undefined) => {
        if (!old) return old
        return {
          ...old,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      })

      return { previousExecution, executionId }
    },
    onSuccess: (updatedExecution, variables) => {
      // Update all caches with the real data
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(variables.executionId), updatedExecution)

      // Update lists
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.byWorkflow(updatedExecution.workflowId) })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.stats() })

      toast.success('Execution updated successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousExecution) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(context.executionId), context.previousExecution)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update execution'
      toast.error('Failed to update execution', {
        description: errorMessage,
      })
    },
  })
}

// Start execution
export function useStartExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.post(`/api/v1/executions/${executionId}/start`)
      return response.data.data
    },
    onSuccess: (execution, executionId) => {
      // Update execution in cache
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(executionId), execution)
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.active() })

      toast.success('Execution started successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to start execution'
      toast.error('Failed to start execution', {
        description: errorMessage,
      })
    },
  })
}

// Pause execution
export function usePauseExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.post(`/api/v1/executions/${executionId}/pause`)
      return response.data.data
    },
    onSuccess: (execution, executionId) => {
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(executionId), execution)
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.active() })

      toast.success('Execution paused successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to pause execution'
      toast.error('Failed to pause execution', {
        description: errorMessage,
      })
    },
  })
}

// Resume execution
export function useResumeExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.post(`/api/v1/executions/${executionId}/resume`)
      return response.data.data
    },
    onSuccess: (execution, executionId) => {
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(executionId), execution)
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.active() })

      toast.success('Execution resumed successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to resume execution'
      toast.error('Failed to resume execution', {
        description: errorMessage,
      })
    },
  })
}

// Cancel execution
export function useCancelExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ executionId, reason }: { executionId: string; reason?: string }): Promise<ExecutionModel> => {
      const response: FetchResponse<ApiResponse<ExecutionModel>> = await api.post(`/api/v1/executions/${executionId}/cancel`, { reason })
      return response.data.data
    },
    onSuccess: (execution, variables) => {
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.detail(variables.executionId), execution)
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.active() })

      toast.success('Execution cancelled successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to cancel execution'
      toast.error('Failed to cancel execution', {
        description: errorMessage,
      })
    },
  })
}

// Delete execution
export function useDeleteExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/executions/${executionId}`)
      return response.data.data
    },
    onMutate: async executionId => {
      // Get execution details before deletion for rollback
      const execution = queryClient.getQueryData(EXECUTION_QUERY_KEYS.detail(executionId)) as ExecutionModel

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })

      // Snapshot previous data
      const previousExecutions = queryClient.getQueryData(EXECUTION_QUERY_KEYS.list())
      const previousWorkflowExecutions = execution?.workflowId ? queryClient.getQueryData(EXECUTION_QUERY_KEYS.byWorkflow(execution.workflowId)) : null

      // Optimistically remove from lists
      queryClient.setQueryData(EXECUTION_QUERY_KEYS.list(), (old: { executions: ExecutionModel[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          executions: old.executions.filter(e => e.id !== executionId),
        }
      })

      if (execution?.workflowId) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.byWorkflow(execution.workflowId), (old: { executions: ExecutionModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            executions: old.executions.filter(e => e.id !== executionId),
          }
        })
      }

      return { previousExecutions, previousWorkflowExecutions, execution, executionId }
    },
    onError: (error: any, executionId, context) => {
      // Rollback optimistic updates
      if (context?.previousExecutions) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.list(), context.previousExecutions)
      }
      if (context?.previousWorkflowExecutions && context.execution?.workflowId) {
        queryClient.setQueryData(EXECUTION_QUERY_KEYS.byWorkflow(context.execution.workflowId), context.previousWorkflowExecutions)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete execution'
      toast.error('Failed to delete execution', {
        description: errorMessage,
      })
    },
    onSuccess: (data, executionId, context) => {
      // Remove from all caches
      queryClient.removeQueries({ queryKey: EXECUTION_QUERY_KEYS.detail(executionId) })

      toast.success('Execution deleted successfully!')
    },
    onSettled: (data, error, executionId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.active() })
      queryClient.invalidateQueries({ queryKey: EXECUTION_QUERY_KEYS.stats() })
    },
  })
}

// Utility hook for managing active execution selection with local storage
export function useActiveExecution() {
  const setActiveExecution = (executionId: string | null) => {
    if (executionId) {
      localStorage.setItem('activeExecutionId', executionId)
    } else {
      localStorage.removeItem('activeExecutionId')
    }
  }

  const getActiveExecutionId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeExecutionId')
    }
    return null
  }

  return {
    setActiveExecution,
    getActiveExecutionId,
    clearActiveExecution: () => setActiveExecution(null),
  }
}
