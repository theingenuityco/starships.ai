import { useState, useEffect, useCallback } from 'react'
import { workflowAPI } from '@/lib/workflowApi'
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
 */
export function useWorkflow({
  expeditionId,
  enabled = true,
  pollInterval = 30000
}: UseWorkflowOptions): UseWorkflowReturn {
  const [workflow, setWorkflow] = useState<WorkflowDSL | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [executionStatus, setExecutionStatus] = useState<{
    workflowId: string
    expeditionId: string
    currentStatus: string
    currentNodeId: string | null
    startTime: string | null
    endTime: string | null
    totalNodes: number
    completedNodes: number
  } | null>(null)
  const [pendingPrompts, setPendingPrompts] = useState<any[]>([])

  /**
   * Fetch workflow data
   */
  const fetchWorkflow = useCallback(async () => {
    if (!expeditionId || !enabled) return

    try {
      setLoading(true)
      setError(null)
      
      const workflowData = await workflowAPI.getWorkflow(expeditionId)
      setWorkflow(workflowData)
    } catch (err) {
      console.error('Failed to fetch workflow:', err)
      setError(err as Error)
      setWorkflow(null)
    } finally {
      setLoading(false)
    }
  }, [expeditionId, enabled])

  /**
   * Fetch execution status
   */
  const fetchExecutionStatus = useCallback(async () => {
    if (!expeditionId || !enabled) return

    try {
      const status = await workflowAPI.getWorkflowExecutionStatus(expeditionId)
      setExecutionStatus(status)
    } catch (err) {
      console.error('Failed to fetch execution status:', err)
      setExecutionStatus(null)
    }
  }, [expeditionId, enabled])

  /**
   * Fetch pending prompts
   */
  const fetchPendingPrompts = useCallback(async () => {
    if (!expeditionId || !enabled) return

    try {
      const prompts = await workflowAPI.getPendingUserPrompts(expeditionId)
      setPendingPrompts(prompts)
    } catch (err) {
      console.error('Failed to fetch pending prompts:', err)
      setPendingPrompts([])
    }
  }, [expeditionId, enabled])

  /**
   * Approve workflow
   */
  const approveWorkflow = useCallback(async (userId: string) => {
    if (!expeditionId) throw new Error('No expedition ID provided')

    try {
      setLoading(true)
      await workflowAPI.approveWorkflow(expeditionId, userId)
      
      // Refresh workflow data to get updated status
      await fetchWorkflow()
      await fetchExecutionStatus()
    } catch (err) {
      console.error('Failed to approve workflow:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [expeditionId, fetchWorkflow, fetchExecutionStatus])

  /**
   * Reject workflow
   */
  const rejectWorkflow = useCallback(async (userId: string, reason?: string) => {
    if (!expeditionId) throw new Error('No expedition ID provided')

    try {
      setLoading(true)
      await workflowAPI.rejectWorkflow(expeditionId, userId, reason)
      
      // Refresh workflow data to get updated status
      await fetchWorkflow()
    } catch (err) {
      console.error('Failed to reject workflow:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [expeditionId, fetchWorkflow])

  /**
   * Refresh workflow data
   */
  const refreshWorkflow = useCallback(async () => {
    await Promise.all([
      fetchWorkflow(),
      fetchExecutionStatus(),
      fetchPendingPrompts()
    ])
  }, [fetchWorkflow, fetchExecutionStatus, fetchPendingPrompts])

  /**
   * Refresh execution status only
   */
  const refreshExecutionStatus = useCallback(async () => {
    await fetchExecutionStatus()
  }, [fetchExecutionStatus])

  /**
   * Initial data fetch
   */
  useEffect(() => {
    if (enabled && expeditionId) {
      refreshWorkflow()
    }
  }, [enabled, expeditionId, refreshWorkflow])

  /**
   * Polling for execution status updates
   */
  useEffect(() => {
    if (!enabled || !expeditionId || !pollInterval) return

    const interval = setInterval(() => {
      fetchExecutionStatus()
      fetchPendingPrompts()
    }, pollInterval)

    return () => clearInterval(interval)
  }, [enabled, expeditionId, pollInterval, fetchExecutionStatus, fetchPendingPrompts])

  return {
    workflow,
    loading,
    error,
    executionStatus,
    pendingPrompts,
    approveWorkflow,
    rejectWorkflow,
    refreshWorkflow,
    refreshExecutionStatus
  }
}