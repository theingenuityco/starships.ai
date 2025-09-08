/**
 * Minimal Streaming Emitter Interface
 *
 * Provides a lean interface for external streaming implementations (like server)
 * to handle autopilot execution events without autopilot knowing about specific
 * streaming formats or protocols.
 */

import type { ExecutionEvent } from '@/engine/Engine';

/**
 * Interface for external streaming implementations
 */
export interface StreamingEmitter {
  /**
   * Handle execution event from autopilot engine
   */
  emitExecutionEvent(event: ExecutionEvent): Promise<void>;

  /**
   * Check if streaming is currently enabled
   */
  isEnabled(): boolean;
}
