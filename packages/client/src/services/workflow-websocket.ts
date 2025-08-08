import { useEffect, useCallback } from 'react'
import SocketClient from '@/lib/socket-client'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowDSL } from '@starships/protocol'

/**
 * Workflow-related WebSocket event interfaces
 */
interface WorkflowUpdateEvent {
  expeditionId: string
  workflow: WorkflowDSL
}

interface WorkflowExecutionStatusUpdateEvent {
  expeditionId: string
  status: {
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
}

interface WorkflowUserPromptEvent {
  expeditionId: string
  prompt: {
    id: string
    expeditionId: string
    workflowId: string
    nodeId: string
    prompt: string
    timestamp: string
    isResolved: boolean
    response?: string
  }
}

interface WorkflowNotificationEvent {
  notification: {
    id: string
    type: 'approval_pending' | 'approved' | 'rejected' | 'execution_started' | 'execution_completed' | 'execution_failed' | 'user_prompt'
    title: string
    message: string
    expeditionId: string
    workflowId?: string
    timestamp: string
    isRead: boolean
  }
}

/**
 * Workflow WebSocket service class
 */
class WorkflowWebSocketService {
  private static instance: WorkflowWebSocketService
  private socketClient: SocketClient
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map()

  private constructor() {
    this.socketClient = SocketClient.getInstance()
  }

  static getInstance(): WorkflowWebSocketService {
    if (!WorkflowWebSocketService.instance) {
      WorkflowWebSocketService.instance = new WorkflowWebSocketService()
    }
    return WorkflowWebSocketService.instance
  }

  /**
   * Initialize workflow-specific WebSocket event listeners
   */
  initialize() {
    const socket = this.socketClient.getSocket()
    if (!socket) {
      console.warn('[WORKFLOW WS] Socket not available, cannot initialize workflow listeners')
      return
    }

    // Register workflow event listeners
    socket.on('workflow:updated', this.handleWorkflowUpdate.bind(this))
    socket.on('workflow:execution-status', this.handleExecutionStatusUpdate.bind(this))
    socket.on('workflow:user-prompt', this.handleUserPrompt.bind(this))
    socket.on('workflow:notification', this.handleNotification.bind(this))
    socket.on('workflow:approval-request', this.handleApprovalRequest.bind(this))

    console.log('[WORKFLOW WS] Workflow WebSocket listeners initialized')
  }

  /**
   * Clean up workflow-specific WebSocket event listeners
   */
  cleanup() {
    const socket = this.socketClient.getSocket()
    if (!socket) return

    // Remove workflow event listeners
    socket.off('workflow:updated', this.handleWorkflowUpdate.bind(this))
    socket.off('workflow:execution-status', this.handleExecutionStatusUpdate.bind(this))
    socket.off('workflow:user-prompt', this.handleUserPrompt.bind(this))
    socket.off('workflow:notification', this.handleNotification.bind(this))
    socket.off('workflow:approval-request', this.handleApprovalRequest.bind(this))

    console.log('[WORKFLOW WS] Workflow WebSocket listeners cleaned up')
  }

  /**
   * Join workflow-specific rooms for an expedition
   */
  joinWorkflowRooms(expeditionId: string, userId: string) {
    const socket = this.socketClient.getSocket()
    if (!socket?.connected) {
      console.warn('[WORKFLOW WS] Cannot join workflow rooms - socket not connected')
      return
    }

    // Join expedition-specific workflow room
    socket.emit('workflow:join-room', { expeditionId, userId })
    console.log(`[WORKFLOW WS] Joined workflow room for expedition: ${expeditionId}`)
  }

  /**
   * Leave workflow-specific rooms for an expedition
   */
  leaveWorkflowRooms(expeditionId: string, userId: string) {
    const socket = this.socketClient.getSocket()
    if (!socket?.connected) {
      console.warn('[WORKFLOW WS] Cannot leave workflow rooms - socket not connected')
      return
    }

    // Leave expedition-specific workflow room
    socket.emit('workflow:leave-room', { expeditionId, userId })
    console.log(`[WORKFLOW WS] Left workflow room for expedition: ${expeditionId}`)
  }

  /**
   * Handle workflow update events
   */
  private handleWorkflowUpdate(event: WorkflowUpdateEvent) {
    console.log('[WORKFLOW WS] Received workflow update:', event)
    
    // Get store instance and update workflow
    const store = useWorkflowStore.getState()
    store.handleWorkflowUpdate(event.expeditionId, event.workflow)
    
    // Emit custom event for components
    this.emitCustomEvent('workflow-updated', event)
  }

  /**
   * Handle execution status update events
   */
  private handleExecutionStatusUpdate(event: WorkflowExecutionStatusUpdateEvent) {
    console.log('[WORKFLOW WS] Received execution status update:', event)
    
    // Get store instance and update status
    const store = useWorkflowStore.getState()
    store.handleExecutionStatusUpdate(event.expeditionId, event.status)
    
    // Emit custom event for components
    this.emitCustomEvent('workflow-execution-status-updated', event)
  }

  /**
   * Handle user prompt events
   */
  private handleUserPrompt(event: WorkflowUserPromptEvent) {
    console.log('[WORKFLOW WS] Received user prompt:', event)
    
    // Get store instance and update prompts
    const store = useWorkflowStore.getState()
    store.handleUserPrompt(event.expeditionId, event.prompt)
    
    // Emit custom event for components
    this.emitCustomEvent('workflow-user-prompt', event)
  }

  /**
   * Handle notification events
   */
  private handleNotification(event: WorkflowNotificationEvent) {
    console.log('[WORKFLOW WS] Received notification:', event)
    
    // Get store instance and add notification
    const store = useWorkflowStore.getState()
    store.handleNotification(event.notification)
    
    // Emit custom event for components
    this.emitCustomEvent('workflow-notification', event)
  }

  /**
   * Handle approval request events
   */
  private handleApprovalRequest(event: WorkflowNotificationEvent) {
    console.log('[WORKFLOW WS] Received approval request:', event)
    
    // Get store instance and add notification
    const store = useWorkflowStore.getState()
    store.handleNotification({
      ...event.notification,
      type: 'approval_pending'
    })
    
    // Emit custom event for components
    this.emitCustomEvent('workflow-approval-request', event)
  }

  /**
   * Subscribe to custom workflow events
   */
  on(eventName: string, handler: (...args: any[]) => void) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set())
    }
    this.eventHandlers.get(eventName)!.add(handler)
  }

  /**
   * Unsubscribe from custom workflow events
   */
  off(eventName: string, handler?: (...args: any[]) => void) {
    const handlers = this.eventHandlers.get(eventName)
    if (!handlers) return

    if (handler) {
      handlers.delete(handler)
    } else {
      handlers.clear()
    }
  }

  /**
   * Emit custom events to subscribed handlers
   */
  private emitCustomEvent(eventName: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(eventName)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args)
        } catch (error) {
          console.error(`[WORKFLOW WS] Error in event handler for ${eventName}:`, error)
        }
      })
    }
  }

  /**
   * Send workflow-related messages to the server
   */
  emit(event: string, data: any) {
    const socket = this.socketClient.getSocket()
    if (socket?.connected) {
      socket.emit(event, data)
    } else {
      console.warn(`[WORKFLOW WS] Cannot emit ${event} - socket not connected`)
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.socketClient.isConnected()
  }
}

/**
 * React hook for workflow WebSocket integration
 */
export function useWorkflowWebSocket(expeditionId?: string, userId?: string) {
  const workflowWS = WorkflowWebSocketService.getInstance()
  const {
    setWebSocketConnected,
    setWebSocketReconnecting
  } = useWorkflowStore()

  // Initialize WebSocket service
  useEffect(() => {
    workflowWS.initialize()

    // Update store connection status
    setWebSocketConnected(workflowWS.isConnected())

    return () => {
      workflowWS.cleanup()
    }
  }, [workflowWS, setWebSocketConnected])

  // Join/leave rooms when expedition ID changes
  useEffect(() => {
    if (!expeditionId || !userId) return

    workflowWS.joinWorkflowRooms(expeditionId, userId)

    return () => {
      workflowWS.leaveWorkflowRooms(expeditionId, userId)
    }
  }, [expeditionId, userId, workflowWS])

  // Subscribe to workflow events
  const subscribe = useCallback((eventName: string, handler: (...args: any[]) => void) => {
    workflowWS.on(eventName, handler)
    return () => workflowWS.off(eventName, handler)
  }, [workflowWS])

  // Emit workflow events
  const emit = useCallback((event: string, data: any) => {
    workflowWS.emit(event, data)
  }, [workflowWS])

  return {
    subscribe,
    emit,
    isConnected: workflowWS.isConnected(),
    service: workflowWS
  }
}

export default WorkflowWebSocketService