import { CancelledError } from '@/errors/CancelledError';
import { config } from '@/constants';

const RETRYABLE_PATTERNS = [
  'timed out',
  'timeout',
  'econnreset',
  'etimedout',
  'fetch failed',
  'network',
  'econnrefused',
  'econnaborted',
  'socket hang up',
  'enotfound',
  'eai_again',
  'rate limit',
  '429',
  '503',
  '502',
  '500',
  'out of memory',
  'heap',
  'allocation failed',
  'remote runner stream error',
];

/**
 * Determines if an error is transient and safe to retry.
 * - Retry: timeouts, network errors, 5xx, 429, resource exhaustion
 * - No retry: CancelledError, validation, 4xx (except 429), user/logic errors
 */
export function isRetryableRunnerError(err: unknown, status?: number): boolean {
  if (err instanceof CancelledError) return false;
  if (typeof status === 'number' && (status >= 500 || status === 429)) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '');
  const lower = msg.toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => lower.includes(p));
}

export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  logPrefix?: string;
}

/**
 * Executes a function with retries on transient runner failures.
 * Uses config.DEFAULT_RETRIES and config.RETRY_BACKOFF_MS.
 */
export async function withRunnerRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? config.DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? config.RETRY_BACKOFF_MS;
  const prefix = options.logPrefix ?? '[retry]';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as Error & { status?: number }).status;
      if (attempt >= maxAttempts || !isRetryableRunnerError(err, status)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${prefix} transient error [${attempt}/${maxAttempts}], retrying in ${backoffMs}ms`, {
        error: msg,
      });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
