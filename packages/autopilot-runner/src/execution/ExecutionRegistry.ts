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
  // Keep cancellations for a short TTL to avoid register/unregister races and allow queued/starting runs to be cancelled.
  private cancelledUntil = new Map<string, number>();
  private static readonly CANCEL_TTL_MS = 5 * 60 * 1000;

  private prune(now: number = Date.now()): void {
    for (const [requestId, until] of this.cancelledUntil.entries()) {
      if (until <= now) this.cancelledUntil.delete(requestId);
    }
  }

  register(handle: ActiveHandle): void {
    this.active.set(handle.requestId, handle);
    // Handle the "cancel-before-register" race:
    // cancel(requestId) can be called before the executor registers the handle.
    // In that case, immediately cancel this handle as soon as it registers.
    if (this.isCancelled(handle.requestId)) {
      this.cancel(handle.requestId);
    }
  }

  unregister(requestId: string): void {
    this.active.delete(requestId);
    // Do NOT clear cancellation state here; cancel() can race with unregister().
    // TTL pruning keeps this bounded.
    this.prune();
  }

  isCancelled(requestId: string): boolean {
    if (!requestId) return false;
    const now = Date.now();
    this.prune(now);
    const until = this.cancelledUntil.get(requestId);
    return typeof until === 'number' && until > now;
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
    const now = Date.now();
    this.cancelledUntil.set(requestId, now + ExecutionRegistry.CANCEL_TTL_MS);
    this.prune(now);
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
