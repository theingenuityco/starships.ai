import api from './api'
import { apiCache, CACHE_KEYS } from './cache'
import type {
  WorkflowDSL,
  WorkflowGenerationRequest,
  WorkflowGenerationResult,
  WorkflowApprovalStatus,
  WorkflowRuntimeState
} from '@starships/protocol'
import type { AxiosError } from 'axios'

// ============================================================================
// ERROR HANDLING AND TYPES
// ============================================================================

/**
 * Workflow API error class
 */
export class WorkflowAPIError extends Error {
  public readonly statusCode: number
  public readonly details?: any
  public readonly workflowId?: string
  public readonly expeditionId?: string

  constructor(
    message: string,
    statusCode: number = 500,
    details?: any,
    workflowId?: string,
    expeditionId?: string
  ) {
    super(message)
    this.name = 'WorkflowAPIError'
    this.statusCode = statusCode
    this.details = details
    this.workflowId = workflowId
    this.expeditionId = expeditionId
  }
}

/**
 * Handle workflow API errors with context
 */
const handleWorkflowError = (
  error: AxiosError,
  context: string,
  expeditionId?: string,
  workflowId?: string
): never => {
  const statusCode = error.response?.status || 500
  const errorData = error.response?.data as any
  const message = errorData?.message || error.message || 'Unknown workflow API error'
  
  throw new WorkflowAPIError(
    `${context}: ${message}`,
    statusCode,
    errorData,
    workflowId,
    expeditionId
  )
}

// ============================================================================
// WORKFLOW API FUNCTIONS
// ============================================================================

/**
 * Get workflow DSL for an expedition
 */
export const getWorkflow = async (expeditionId: string): Promise<WorkflowDSL | null> => {
  try {
    // Check cache first
    const cacheKey = `workflow_${expeditionId}`
    const cached = apiCache.get<WorkflowDSL>(cacheKey)
    if (cached) {
      return cached
    }

    const response = await api.get<{ success: boolean; data: WorkflowDSL }>(
      `/expeditions/${expeditionId}/workflow`
    )

    if (response.data.success && response.data.data) {
      // Cache for 5 minutes
      apiCache.set(cacheKey, response.data.data, 300)
      return response.data.data
    }

    return null
  } catch (error) {
    if ((error as AxiosError).response?.status === 404) {
      return null // No workflow found
    }
    handleWorkflowError(
      error as AxiosError,
      'Failed to get workflow',
      expeditionId
    )
  }
}

/**
 * Approve a workflow DSL
 */
export const approveWorkflow = async (
  expeditionId: string,
  userId: string
): Promise<WorkflowDSL> => {
  try {
    const response = await api.post<{ success: boolean; data: WorkflowDSL; message: string }>(
      `/expeditions/${expeditionId}/workflow/approve`,
      { userId }
    )

    if (response.data.success && response.data.data) {
      // Clear cache to force refresh
      const cacheKey = `workflow_${expeditionId}`
      apiCache.delete(cacheKey)
      
      return response.data.data
    }

    throw new Error('Failed to approve workflow')
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to approve workflow',
      expeditionId
    )
  }
}

/**
 * Reject a workflow DSL
 */
export const rejectWorkflow = async (
  expeditionId: string,
  userId: string,
  reason?: string
): Promise<WorkflowDSL> => {
  try {
    const response = await api.post<{ success: boolean; data: WorkflowDSL; message: string }>(
      `/expeditions/${expeditionId}/workflow/reject`,
      { userId, reason }
    )

    if (response.data.success && response.data.data) {
      // Clear cache to force refresh
      const cacheKey = `workflow_${expeditionId}`
      apiCache.delete(cacheKey)
      
      return response.data.data
    }

    throw new Error('Failed to reject workflow')
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to reject workflow',
      expeditionId
    )
  }
}

/**
 * Update a workflow DSL
 */
export const updateWorkflow = async (
  expeditionId: string,
  workflowData: Partial<WorkflowDSL>
): Promise<WorkflowDSL> => {
  try {
    const response = await api.put<{ success: boolean; data: WorkflowDSL; message: string }>(
      `/expeditions/${expeditionId}/workflow`,
      { workflow: workflowData }
    )

    if (response.data.success && response.data.data) {
      // Clear cache to force refresh
      const cacheKey = `workflow_${expeditionId}`
      apiCache.delete(cacheKey)
      
      return response.data.data
    }

    throw new Error('Failed to update workflow')
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to update workflow',
      expeditionId
    )
  }
}

/**
 * Generate workflow visualization
 */
export const generateWorkflowVisualization = async (
  expeditionId: string
): Promise<{
  visualization: string
  workflowId: string
  nodeCount: number
  edgeCount: number
}> => {
  try {
    const response = await api.post<{
      success: boolean
      data: {
        visualization: string
        workflowId: string
        nodeCount: number
        edgeCount: number
      }
    }>(`/expeditions/${expeditionId}/workflow/visualize`)

    if (response.data.success && response.data.data) {
      return response.data.data
    }

    throw new Error('Failed to generate workflow visualization')
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to generate workflow visualization',
      expeditionId
    )
  }
}

/**
 * Get workflow execution status
 */
export const getWorkflowExecutionStatus = async (
  expeditionId: string
): Promise<{
  workflowId: string
  expeditionId: string
  currentStatus: string
  currentNodeId: string | null
  startTime: string | null
  endTime: string | null
  totalNodes: number
  completedNodes: number
} | null> => {
  try {
    const response = await api.get<{
      success: boolean
      data: {
        workflowId: string
        expeditionId: string
        currentStatus: string
        currentNodeId: string | null
        startTime: string | null
        endTime: string | null
        totalNodes: number
        completedNodes: number
      }
    }>(`/expeditions/${expeditionId}/workflow/execution-status`)

    if (response.data.success && response.data.data) {
      return response.data.data
    }

    return null
  } catch (error) {
    if ((error as AxiosError).response?.status === 404) {
      return null // No workflow execution found
    }
    handleWorkflowError(
      error as AxiosError,
      'Failed to get workflow execution status',
      expeditionId
    )
  }
}

/**
 * Pause workflow execution
 */
export const pauseWorkflowExecution = async (
  expeditionId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post<{
      success: boolean
      message: string
      data: any
    }>(`/expeditions/${expeditionId}/workflow/pause`)

    return {
      success: response.data.success,
      message: response.data.message
    }
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to pause workflow execution',
      expeditionId
    )
  }
}

/**
 * Resume workflow execution
 */
export const resumeWorkflowExecution = async (
  expeditionId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post<{
      success: boolean
      message: string
      data: any
    }>(`/expeditions/${expeditionId}/workflow/resume`)

    return {
      success: response.data.success,
      message: response.data.message
    }
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to resume workflow execution',
      expeditionId
    )
  }
}

/**
 * Get pending user prompts for workflow
 */
export const getPendingUserPrompts = async (
  expeditionId: string
): Promise<any[]> => {
  try {
    const response = await api.get<{
      success: boolean
      data: {
        expeditionId: string
        pendingPrompts: any[]
        count: number
      }
    }>(`/expeditions/${expeditionId}/user-prompts/pending`)

    if (response.data.success && response.data.data) {
      return response.data.data.pendingPrompts
    }

    return []
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to get pending user prompts',
      expeditionId
    )
  }
}

/**
 * Respond to a user prompt
 */
export const respondToUserPrompt = async (
  expeditionId: string,
  promptId: string,
  response: any,
  userId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const apiResponse = await api.post<{
      success: boolean
      message: string
      data: any
    }>(`/expeditions/${expeditionId}/user-prompt/${promptId}/respond`, {
      response,
      userId
    })

    return {
      success: apiResponse.data.success,
      message: apiResponse.data.message
    }
  } catch (error) {
    handleWorkflowError(
      error as AxiosError,
      'Failed to respond to user prompt',
      expeditionId
    )
  }
}

// ============================================================================
// WORKFLOW API OBJECT
// ============================================================================

/**
 * Centralized workflow API object
 */
export const workflowAPI = {
  getWorkflow,
  approveWorkflow,
  rejectWorkflow,
  updateWorkflow,
  generateWorkflowVisualization,
  getWorkflowExecutionStatus,
  pauseWorkflowExecution,
  resumeWorkflowExecution,
  getPendingUserPrompts,
  respondToUserPrompt,
}

export default workflowAPI