import { Engine, type Execution } from '@starships/autopilot';

type ActiveHandle = {
  requestId: string;
  engine: Engine;
  execution: Execution;
  controller: AbortController;
};

/**
 * Tracks in-flight executions in the runner so they can be cancelled by request_id.
 */
class ExecutionRegistry {
  private active = new Map<string, ActiveHandle>();
  private cancelled = new Set<string>();

  register(handle: ActiveHandle): void {
    this.active.set(handle.requestId, handle);
    // Handle the "cancel-before-register" race:
    // cancel(requestId) can be called before the executor registers the handle.
    // In that case, immediately cancel this handle as soon as it registers.
    if (this.cancelled.has(handle.requestId)) {
      this.cancel(handle.requestId);
    }
  }

  unregister(requestId: string): void {
    this.active.delete(requestId);
    this.cancelled.delete(requestId);
  }

  isCancelled(requestId: string): boolean {
    return this.cancelled.has(requestId);
  }

  /**
   * Cancel an in-flight (or queued) execution by request id.
   * Returns true if cancellation was recorded (always true for a non-empty requestId).
   *
   * Note: The handle may not yet be registered when this is called (queued / starting).
   * We still record the cancellation so the executor can short-circuit or cancel-on-register.
   */
  cancel(requestId: string): boolean {
    if (!requestId) return false;
    this.cancelled.add(requestId);
    const handle = this.active.get(requestId);
    if (!handle) return true;
    try {
      // Abort in-flight HTTP/LLM calls
      handle.controller.abort();
    } catch (err) {
      console.warn('[ExecutionRegistry] Failed to abort controller during cancel', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      // Cooperatively stop the engine loop
      handle.engine.cancel(handle.execution);
    } catch (err) {
      console.warn('[ExecutionRegistry] Failed to cancel engine during cancel', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }
}

export const executionRegistry = new ExecutionRegistry();
