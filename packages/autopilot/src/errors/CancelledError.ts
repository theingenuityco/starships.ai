/**
 * CancelledError
 *
 * Thrown when execution is explicitly cancelled by the host (e.g. user pressed Stop).
 * This should be treated as a graceful termination signal, not a workflow failure.
 */
export class CancelledError extends Error {
  constructor(message = 'cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}
