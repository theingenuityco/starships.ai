/**
 * StreamingWorkerManager - Web Worker based streaming manager
 *
 * This class manages SSE streaming through a Web Worker,
 * completely offloading processing from the main thread.
 */

export interface WorkerStreamConfig {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: any
  onEvent?: (event: any) => void
  onStatus?: (status: string) => void
  onError?: (error: any) => void
  onComplete?: () => void
}

export class StreamingWorkerManager {
  private worker: Worker | null = null
  private streams: Map<string, WorkerStreamConfig> = new Map()
  private streamIdCounter = 0
  private initPromise: Promise<void> | null = null

  constructor() {
    this.initWorker()
  }

  /**
   * Initialize the Web Worker
   */
  private async initWorker(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Create worker from public directory
        this.worker = new Worker('/streaming.worker.js')

        // Handle messages from worker
        this.worker.addEventListener('message', event => {
          this.handleWorkerMessage(event.data)
        })

        // Handle worker errors
        this.worker.addEventListener('error', error => {
          console.error('[StreamingWorkerManager] Worker error:', error)
          reject(error)
        })

        console.log('[StreamingWorkerManager] Worker initialized')
        resolve()
      } catch (error) {
        console.error('[StreamingWorkerManager] Failed to initialize worker:', error)
        reject(error)
      }
    })

    return this.initPromise
  }

  /**
   * Handle messages from the Web Worker
   */
  private handleWorkerMessage(message: any): void {
    const { type, streamId, event, status, error } = message

    const config = this.streams.get(streamId)
    if (!config) {
      return
    }

    switch (type) {
      case 'EVENT':
        config.onEvent?.(event)
        break
      case 'STATUS':
        config.onStatus?.(status)
        break
      case 'ERROR':
        config.onError?.(error)
        break
      case 'COMPLETE':
        config.onComplete?.()
        this.streams.delete(streamId)
        break
      default:
        console.warn('[StreamingWorkerManager] Unknown message type:', type)
    }
  }

  /**
   * Start a new stream
   */
  async startStream(config: WorkerStreamConfig): Promise<string> {
    // Ensure worker is initialized
    await this.initWorker()

    if (!this.worker) {
      throw new Error('Worker not initialized')
    }

    // Generate stream ID
    const streamId = `stream-${++this.streamIdCounter}`

    // Store config
    this.streams.set(streamId, config)

    // Send message to worker
    this.worker.postMessage({
      type: 'START_STREAM',
      id: streamId,
      payload: {
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
      },
    })

    return streamId
  }

  /**
   * Stop a specific stream
   */
  stopStream(streamId: string): void {
    if (!this.worker) {
      return
    }

    this.worker.postMessage({
      type: 'STOP_STREAM',
      id: streamId,
    })

    this.streams.delete(streamId)
  }

  /**
   * Stop all streams
   */
  stopAllStreams(): void {
    if (!this.worker) {
      return
    }

    this.worker.postMessage({
      type: 'STOP_ALL',
    })

    this.streams.clear()
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy(): void {
    this.stopAllStreams()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.streams.clear()
    this.initPromise = null
  }
}

// Singleton instance
let workerManagerInstance: StreamingWorkerManager | null = null

/**
 * Get or create the singleton StreamingWorkerManager instance
 */
export function getStreamingWorkerManager(): StreamingWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new StreamingWorkerManager()
  }
  return workerManagerInstance
}

/**
 * Clean up the singleton instance
 */
export function destroyStreamingWorkerManager(): void {
  if (workerManagerInstance) {
    workerManagerInstance.destroy()
    workerManagerInstance = null
  }
}
