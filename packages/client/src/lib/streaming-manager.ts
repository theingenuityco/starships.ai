/**
 * StreamingManager - Non-blocking SSE streaming handler
 *
 * This class manages Server-Sent Events (SSE) connections for real-time streaming
 * without blocking the JavaScript event loop, ensuring React state updates can
 * be processed immediately.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface StreamingEvent {
  type: 'chunk' | 'patch' | 'complete' | 'error' | 'message'
  data: any
  timestamp: number
}

export interface StreamingManagerOptions {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: any
  onEvent: (event: StreamingEvent) => void | Promise<void>
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
}

export class StreamingManager {
  private abortController: AbortController | null = null
  private isStreaming = false
  private eventQueue: StreamingEvent[] = []
  private processing = false

  constructor(private options: StreamingManagerOptions) {}

  /**
   * Start streaming with non-blocking event processing
   */
  async start(): Promise<void> {
    if (this.isStreaming) {
      console.warn('[StreamingManager] Already streaming')
      return
    }

    this.isStreaming = true
    this.abortController = new AbortController()
    this.eventQueue = []

    // Start the event processor in the background
    this.processEventQueue()

    try {
      await fetchEventSource(this.options.url, {
        method: this.options.method || 'POST',
        headers: this.options.headers,
        body: this.options.body ? JSON.stringify(this.options.body) : undefined,
        signal: this.abortController.signal,

        async onopen(response) {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          console.log('[StreamingManager] Connection opened')
        },

        onmessage: event => {
          // Queue the event instead of processing immediately
          // This prevents blocking the event loop
          this.queueEvent({
            type: 'chunk',
            data: this.parseEventData(event.data),
            timestamp: Date.now(),
          })
        },

        onclose: () => {
          console.log('[StreamingManager] Connection closed')
          this.handleClose()
        },

        onerror: error => {
          console.error('[StreamingManager] Connection error:', error)
          this.handleError(error)
          throw error // Let fetch-event-source handle retries
        },
      })
    } catch (error) {
      this.handleError(error as Error)
    }
  }

  /**
   * Stop streaming
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.isStreaming = false
    this.eventQueue = []
  }

  /**
   * Queue an event for processing
   */
  private queueEvent(event: StreamingEvent): void {
    this.eventQueue.push(event)
  }

  /**
   * Process queued events without blocking the event loop
   * Uses requestIdleCallback for optimal performance
   */
  private async processEventQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.isStreaming || this.eventQueue.length > 0) {
      if (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!

        try {
          // Process the event
          await this.options.onEvent(event)

          // Yield control to the event loop after each event
          // This ensures React can process state updates immediately
          await this.yieldToEventLoop()
        } catch (error) {
          console.error('[StreamingManager] Error processing event:', error)
        }
      } else {
        // No events to process, wait a bit before checking again
        await this.sleep(10)
      }
    }

    this.processing = false
  }

  /**
   * Yield control back to the event loop
   * This allows React to process state updates and re-render
   */
  private yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => {
      // Use requestIdleCallback if available for optimal scheduling
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => resolve())
      } else {
        // Fallback to setTimeout(0) for immediate yielding
        setTimeout(resolve, 0)
      }
    })
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Parse event data safely
   */
  private parseEventData(data: string): any {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
    this.isStreaming = false
    this.queueEvent({
      type: 'complete',
      data: null,
      timestamp: Date.now(),
    })
    this.options.onClose?.()
  }

  /**
   * Handle connection error
   */
  private handleError(error: Error): void {
    this.queueEvent({
      type: 'error',
      data: error,
      timestamp: Date.now(),
    })
    this.options.onError?.(error)
  }

  /**
   * Check if currently streaming
   */
  get streaming(): boolean {
    return this.isStreaming
  }
}

/**
 * Optimized streaming state manager using React's concurrent features
 */
export class ReactStreamingStateManager {
  private listeners: Set<(state: any) => void> = new Set()
  private state: any = {}
  private pendingUpdates: any[] = []
  private updateScheduled = false

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: any) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Update state with batching
   */
  updateState(updater: (prev: any) => any): void {
    this.pendingUpdates.push(updater)
    this.scheduleUpdate()
  }

  /**
   * Schedule batched update using React's scheduler
   */
  private scheduleUpdate(): void {
    if (this.updateScheduled) return
    this.updateScheduled = true

    // Use microtask for immediate processing after current JS execution
    queueMicrotask(() => {
      this.processPendingUpdates()
    })
  }

  /**
   * Process all pending updates in a batch
   */
  private processPendingUpdates(): void {
    if (this.pendingUpdates.length === 0) return

    // Apply all pending updates
    const updates = this.pendingUpdates
    this.pendingUpdates = []
    this.updateScheduled = false

    for (const updater of updates) {
      this.state = updater(this.state)
    }

    // Notify all listeners
    this.listeners.forEach(listener => listener(this.state))
  }

  /**
   * Get current state
   */
  getState(): any {
    return this.state
  }
}
