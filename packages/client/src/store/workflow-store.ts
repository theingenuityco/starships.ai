import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { workflowAPI } from '@/lib/workflowApi'
import type { WorkflowDSL } from '@starships/protocol'

/**
 * Workflow execution status interface
 */
interface WorkflowExecutionStatus {
  workflowId: string
  expeditionId: string
  currentStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  currentNodeId: string | null
  startTime: string | null
  endTime: string | null
  totalNodes: number
  completedNodes: number
  errorMessage?: string
}

/**
 * Workflow user prompt interface
 */
interface WorkflowUserPrompt {
  id: string
  expeditionId: string
  workflowId: string
  nodeId: string
  prompt: string
  timestamp: string
  isResolved: boolean
  response?: string
}

/**
 * Workflow notification interface
 */
interface WorkflowNotification {
  id: string
  type: 'approval_pending' | 'approved' | 'rejected' | 'execution_started' | 'execution_completed' | 'execution_failed' | 'user_prompt'
  title: string
  message: string
  expeditionId: string
  workflowId?: string
  timestamp: string
  isRead: boolean
}

/**
 * Workflow state interface
 */
interface WorkflowState {
  // Workflow data by expedition ID
  workflows: Record<string, WorkflowDSL>
  
  // Execution status by expedition ID
  executionStatuses: Record<string, WorkflowExecutionStatus>
  
  // Pending prompts by expedition ID
  pendingPrompts: Record<string, WorkflowUserPrompt[]>
  
  // Real-time notifications
  notifications: WorkflowNotification[]
  
  // Loading states
  loading: boolean
  loadingByExpedition: Record<string, boolean>
  approvalLoading: Record<string, boolean>
  executionLoading: Record<string, boolean>
  
  // Error states
  error: string | null
  errorsByExpedition: Record<string, string | null>
  
  // WebSocket connection status
  wsConnected: boolean
  wsReconnecting: boolean
  
  // UI state
  selectedWorkflowId: string | null
  visualizationMode: 'visual' | 'ascii'
}

/**
 * Workflow actions interface
 */
interface WorkflowActions {
  // Data fetching
  fetchWorkflow: (expeditionId: string) => Promise<void>
  fetchExecutionStatus: (expeditionId: string) => Promise<void>
  fetchPendingPrompts: (expeditionId: string) => Promise<void>
  refreshWorkflowData: (expeditionId: string) => Promise<void>
  
  // Workflow operations
  approveWorkflow: (expeditionId: string, userId: string) => Promise<void>
  rejectWorkflow: (expeditionId: string, userId: string, reason?: string) => Promise<void>
  updateWorkflow: (expeditionId: string, workflow: Partial<WorkflowDSL>) => Promise<void>
  
  // Execution control
  pauseWorkflowExecution: (expeditionId: string) => Promise<void>
  resumeWorkflowExecution: (expeditionId: string) => Promise<void>
  cancelWorkflowExecution: (expeditionId: string) => Promise<void>
  
  // User prompts
  respondToUserPrompt: (promptId: string, response: string) => Promise<void>
  
  // Notifications
  markNotificationRead: (notificationId: string) => void
  clearAllNotifications: () => void
  
  // WebSocket event handlers
  handleWorkflowUpdate: (expeditionId: string, workflow: WorkflowDSL) => void
  handleApprovalStatusUpdate: (expeditionId: string, status: 'pending' | 'approved' | 'rejected') => void
  handleExecutionStatusUpdate: (expeditionId: string, status: WorkflowExecutionStatus) => void
  handleUserPrompt: (expeditionId: string, prompt: WorkflowUserPrompt) => void
  handleNotification: (notification: WorkflowNotification) => void
  
  // Connection management
  setWebSocketConnected: (connected: boolean) => void
  setWebSocketReconnecting: (reconnecting: boolean) => void
  
  // UI actions
  setSelectedWorkflow: (workflowId: string | null) => void
  setVisualizationMode: (mode: 'visual' | 'ascii') => void
  
  // Error management
  clearErrors: () => void
  clearExpeditionError: (expeditionId: string) => void
  
  // Utility actions
  getWorkflowByExpedition: (expeditionId: string) => WorkflowDSL | null
  getExecutionStatusByExpedition: (expeditionId: string) => WorkflowExecutionStatus | null
  getPendingPromptsByExpedition: (expeditionId: string) => WorkflowUserPrompt[]
  getUnreadNotificationsCount: () => number
}

/**
 * Create workflow store with Zustand
 */
export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  devtools(
    (set, get) => ({
      // Initial state
      workflows: {},
      executionStatuses: {},
      pendingPrompts: {},
      notifications: [],
      
      loading: false,
      loadingByExpedition: {},
      approvalLoading: {},
      executionLoading: {},
      
      error: null,
      errorsByExpedition: {},
      
      wsConnected: false,
      wsReconnecting: false,
      
      selectedWorkflowId: null,
      visualizationMode: 'visual',
      
      // Data fetching actions
      fetchWorkflow: async (expeditionId: string) => {
        set(state => ({
          loadingByExpedition: { ...state.loadingByExpedition, [expeditionId]: true },
          errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: null }
        }))
        
        try {
          const workflow = await workflowAPI.getWorkflow(expeditionId)
          
          set(state => ({
            workflows: { ...state.workflows, [expeditionId]: workflow },
            loadingByExpedition: { ...state.loadingByExpedition, [expeditionId]: false }
          }))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch workflow'
          
          set(state => ({
            loadingByExpedition: { ...state.loadingByExpedition, [expeditionId]: false },
            errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: errorMessage }
          }))
        }
      },
      
      fetchExecutionStatus: async (expeditionId: string) => {
        try {
          const status = await workflowAPI.getWorkflowExecutionStatus(expeditionId)
          
          set(state => ({
            executionStatuses: { ...state.executionStatuses, [expeditionId]: status }
          }))
        } catch (error) {
          console.error('Failed to fetch execution status:', error)
        }
      },
      
      fetchPendingPrompts: async (expeditionId: string) => {
        try {
          const prompts = await workflowAPI.getPendingUserPrompts(expeditionId)
          
          set(state => ({
            pendingPrompts: { ...state.pendingPrompts, [expeditionId]: prompts }
          }))
        } catch (error) {
          console.error('Failed to fetch pending prompts:', error)
        }
      },
      
      refreshWorkflowData: async (expeditionId: string) => {
        await Promise.all([
          get().fetchWorkflow(expeditionId),
          get().fetchExecutionStatus(expeditionId),
          get().fetchPendingPrompts(expeditionId)
        ])
      },
      
      // Workflow operations
      approveWorkflow: async (expeditionId: string, userId: string) => {
        set(state => ({
          approvalLoading: { ...state.approvalLoading, [expeditionId]: true }
        }))
        
        try {
          await workflowAPI.approveWorkflow(expeditionId, userId)
          
          // Refresh workflow data to get updated status
          await get().refreshWorkflowData(expeditionId)
          
          // Add notification
          const notification: WorkflowNotification = {
            id: `approval_${expeditionId}_${Date.now()}`,
            type: 'approved',
            title: 'Workflow Approved',
            message: 'Workflow has been approved and is ready for execution',
            expeditionId,
            timestamp: new Date().toISOString(),
            isRead: false
          }
          
          set(state => ({
            approvalLoading: { ...state.approvalLoading, [expeditionId]: false },
            notifications: [notification, ...state.notifications]
          }))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to approve workflow'
          
          set(state => ({
            approvalLoading: { ...state.approvalLoading, [expeditionId]: false },
            errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: errorMessage }
          }))
          
          throw error
        }
      },
      
      rejectWorkflow: async (expeditionId: string, userId: string, reason?: string) => {
        set(state => ({
          approvalLoading: { ...state.approvalLoading, [expeditionId]: true }
        }))
        
        try {
          await workflowAPI.rejectWorkflow(expeditionId, userId, reason)
          
          // Refresh workflow data to get updated status
          await get().refreshWorkflowData(expeditionId)
          
          // Add notification
          const notification: WorkflowNotification = {
            id: `rejection_${expeditionId}_${Date.now()}`,
            type: 'rejected',
            title: 'Workflow Rejected',
            message: reason ? `Workflow rejected: ${reason}` : 'Workflow has been rejected',
            expeditionId,
            timestamp: new Date().toISOString(),
            isRead: false
          }
          
          set(state => ({
            approvalLoading: { ...state.approvalLoading, [expeditionId]: false },
            notifications: [notification, ...state.notifications]
          }))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to reject workflow'
          
          set(state => ({
            approvalLoading: { ...state.approvalLoading, [expeditionId]: false },
            errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: errorMessage }
          }))
          
          throw error
        }
      },
      
      updateWorkflow: async (expeditionId: string, updates: Partial<WorkflowDSL>) => {
        const currentWorkflow = get().workflows[expeditionId]
        if (!currentWorkflow) return
        
        try {
          const updatedWorkflow = await workflowAPI.updateWorkflow(expeditionId, {
            ...currentWorkflow,
            ...updates
          })
          
          set(state => ({
            workflows: { ...state.workflows, [expeditionId]: updatedWorkflow }
          }))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update workflow'
          
          set(state => ({
            errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: errorMessage }
          }))
          
          throw error
        }
      },
      
      // Execution control
      pauseWorkflowExecution: async (expeditionId: string) => {
        set(state => ({
          executionLoading: { ...state.executionLoading, [expeditionId]: true }
        }))
        
        try {
          await workflowAPI.pauseWorkflowExecution(expeditionId)
          await get().fetchExecutionStatus(expeditionId)
          
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
        } catch (error) {
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
          
          throw error
        }
      },
      
      resumeWorkflowExecution: async (expeditionId: string) => {
        set(state => ({
          executionLoading: { ...state.executionLoading, [expeditionId]: true }
        }))
        
        try {
          await workflowAPI.resumeWorkflowExecution(expeditionId)
          await get().fetchExecutionStatus(expeditionId)
          
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
        } catch (error) {
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
          
          throw error
        }
      },
      
      cancelWorkflowExecution: async (expeditionId: string) => {
        set(state => ({
          executionLoading: { ...state.executionLoading, [expeditionId]: true }
        }))
        
        try {
          // Note: This would need to be added to workflowAPI
          // await workflowAPI.cancelWorkflowExecution(expeditionId)
          await get().fetchExecutionStatus(expeditionId)
          
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
        } catch (error) {
          set(state => ({
            executionLoading: { ...state.executionLoading, [expeditionId]: false }
          }))
          
          throw error
        }
      },
      
      // User prompts
      respondToUserPrompt: async (promptId: string, response: string) => {
        try {
          await workflowAPI.respondToUserPrompt(promptId, response)
          
          // Update prompt in state to mark as resolved
          set(state => {
            const updatedPrompts = { ...state.pendingPrompts }
            
            for (const expeditionId in updatedPrompts) {
              updatedPrompts[expeditionId] = updatedPrompts[expeditionId].map(prompt =>
                prompt.id === promptId
                  ? { ...prompt, isResolved: true, response }
                  : prompt
              )
            }
            
            return { pendingPrompts: updatedPrompts }
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to respond to prompt'
          console.error('Failed to respond to user prompt:', errorMessage)
          throw error
        }
      },
      
      // Notifications
      markNotificationRead: (notificationId: string) => {
        set(state => ({
          notifications: state.notifications.map(notification =>
            notification.id === notificationId
              ? { ...notification, isRead: true }
              : notification
          )
        }))
      },
      
      clearAllNotifications: () => {
        set({ notifications: [] })
      },
      
      // WebSocket event handlers
      handleWorkflowUpdate: (expeditionId: string, workflow: WorkflowDSL) => {
        set(state => ({
          workflows: { ...state.workflows, [expeditionId]: workflow }
        }))
      },
      
      handleApprovalStatusUpdate: (expeditionId: string, status: 'pending' | 'approved' | 'rejected') => {
        set(state => {
          const existingWorkflow = state.workflows[expeditionId]
          if (existingWorkflow) {
            return {
              workflows: {
                ...state.workflows,
                [expeditionId]: { ...existingWorkflow, approvalStatus: status }
              }
            }
          }
          return state
        })
      },
      
      handleExecutionStatusUpdate: (expeditionId: string, status: WorkflowExecutionStatus) => {
        set(state => ({
          executionStatuses: { ...state.executionStatuses, [expeditionId]: status }
        }))
      },
      
      handleUserPrompt: (expeditionId: string, prompt: WorkflowUserPrompt) => {
        set(state => {
          const currentPrompts = state.pendingPrompts[expeditionId] || []
          const updatedPrompts = [...currentPrompts, prompt]
          
          return {
            pendingPrompts: { ...state.pendingPrompts, [expeditionId]: updatedPrompts }
          }
        })
      },
      
      handleNotification: (notification: WorkflowNotification) => {
        set(state => ({
          notifications: [notification, ...state.notifications]
        }))
      },
      
      // Connection management
      setWebSocketConnected: (connected: boolean) => {
        set({ wsConnected: connected, wsReconnecting: false })
      },
      
      setWebSocketReconnecting: (reconnecting: boolean) => {
        set({ wsReconnecting: reconnecting })
      },
      
      // UI actions
      setSelectedWorkflow: (workflowId: string | null) => {
        set({ selectedWorkflowId: workflowId })
      },
      
      setVisualizationMode: (mode: 'visual' | 'ascii') => {
        set({ visualizationMode: mode })
      },
      
      // Error management
      clearErrors: () => {
        set({ error: null, errorsByExpedition: {} })
      },
      
      clearExpeditionError: (expeditionId: string) => {
        set(state => ({
          errorsByExpedition: { ...state.errorsByExpedition, [expeditionId]: null }
        }))
      },
      
      // Utility actions
      getWorkflowByExpedition: (expeditionId: string) => {
        return get().workflows[expeditionId] || null
      },
      
      getExecutionStatusByExpedition: (expeditionId: string) => {
        return get().executionStatuses[expeditionId] || null
      },
      
      getPendingPromptsByExpedition: (expeditionId: string) => {
        return get().pendingPrompts[expeditionId] || []
      },
      
      getUnreadNotificationsCount: () => {
        return get().notifications.filter(n => !n.isRead).length
      }
    }),
    {
      name: 'workflow-store'
    }
  )
)

/**
 * Hook to get workflow data for a specific expedition
 */
export const useExpeditionWorkflow = (expeditionId: string) => {
  const store = useWorkflowStore()
  
  return {
    workflow: store.getWorkflowByExpedition(expeditionId),
    executionStatus: store.getExecutionStatusByExpedition(expeditionId),
    pendingPrompts: store.getPendingPromptsByExpedition(expeditionId),
    loading: store.loadingByExpedition[expeditionId] || false,
    approvalLoading: store.approvalLoading[expeditionId] || false,
    executionLoading: store.executionLoading[expeditionId] || false,
    error: store.errorsByExpedition[expeditionId] || null,
    
    // Actions bound to this expedition
    refresh: () => store.refreshWorkflowData(expeditionId),
    approve: (userId: string) => store.approveWorkflow(expeditionId, userId),
    reject: (userId: string, reason?: string) => store.rejectWorkflow(expeditionId, userId, reason),
    pauseExecution: () => store.pauseWorkflowExecution(expeditionId),
    resumeExecution: () => store.resumeWorkflowExecution(expeditionId),
    cancelExecution: () => store.cancelWorkflowExecution(expeditionId)
  }
}