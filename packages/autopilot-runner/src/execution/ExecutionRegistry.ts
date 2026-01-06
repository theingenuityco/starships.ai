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
   * Returns true if there was an active handle to cancel, false otherwise.
   */
  cancel(requestId: string): boolean {
    if (!requestId) return false;
    this.cancelled.add(requestId);
    const handle = this.active.get(requestId);
    if (!handle) return false;
    try {
      // Abort in-flight HTTP/LLM calls
      handle.controller.abort();
    } catch {
      // ignore
    }
    try {
      // Cooperatively stop the engine loop
      handle.engine.cancel(handle.execution);
    } catch {
      // ignore
    }
    return true;
  }
}

export const executionRegistry = new ExecutionRegistry();
