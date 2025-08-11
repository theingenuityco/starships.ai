import { useEffect } from 'react'
import { useExpeditionWorkflow, useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowDSL } from '@starships/protocol'

export interface UseWorkflowOptions {
  expeditionId: string
  enabled?: boolean
  pollInterval?: number
}

export interface UseWorkflowReturn {
  workflow: WorkflowDSL | null
  loading: boolean
  error: Error | null
  executionStatus: {
    workflowId: string
    expeditionId: string
    currentStatus: string
    currentNodeId: string | null
    startTime: string | null
    endTime: string | null
    totalNodes: number
    completedNodes: number
  } | null
  pendingPrompts: any[]
  approveWorkflow: (userId: string) => Promise<void>
  rejectWorkflow: (userId: string, reason?: string) => Promise<void>
  refreshWorkflow: () => Promise<void>
  refreshExecutionStatus: () => Promise<void>
}

/**
 * Custom hook for managing workflow data and operations
 * Now uses the centralized workflow store for state management
 */
export function useWorkflow({
  expeditionId,
  enabled = true,
  pollInterval = 30000
}: UseWorkflowOptions): UseWorkflowReturn {
  // Use expedition-specific hook from store
  const expeditionData = useExpeditionWorkflow(expeditionId)
  
  // Get additional store actions
  const { fetchExecutionStatus, fetchPendingPrompts } = useWorkflowStore()

  /**
   * Initial data fetch
   */
  useEffect(() => {
    if (enabled && expeditionId) {
      expeditionData.refresh()
    }
  }, [enabled, expeditionId, expeditionData])

  /**
   * Polling for execution status updates
   */
  useEffect(() => {
    if (!enabled || !expeditionId || !pollInterval) return

    const interval = setInterval(() => {
      fetchExecutionStatus(expeditionId)
      fetchPendingPrompts(expeditionId)
    }, pollInterval)

    return () => clearInterval(interval)
  }, [enabled, expeditionId, pollInterval, fetchExecutionStatus, fetchPendingPrompts])

  /**
   * Legacy refreshExecutionStatus function for backward compatibility
   */
  const refreshExecutionStatus = async () => {
    await fetchExecutionStatus(expeditionId)
  }

  return {
    workflow: expeditionData.workflow,
    loading: expeditionData.loading || expeditionData.approvalLoading,
    error: expeditionData.error ? new Error(expeditionData.error) : null,
    executionStatus: expeditionData.executionStatus,
    pendingPrompts: expeditionData.pendingPrompts,
    approveWorkflow: expeditionData.approve,
    rejectWorkflow: expeditionData.reject,
    refreshWorkflow: expeditionData.refresh,
    refreshExecutionStatus
  }
}