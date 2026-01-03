import type { Runner } from './Runner';
import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import type { AutopilotEvent } from '@/types/events';
import { nanoid } from 'nanoid';
import { autopilot } from '@/Autopilot';

export class RemoteRunner implements Runner {
  private readonly baseUrl: string;
  private readonly authToken?: string;

  constructor() {
    const cfg = autopilot.getConfig();
    const url = cfg.remoteRunnerUrl;
    if (!url) {
      throw new Error('RemoteRunner URL not configured. Call autopilot.setRunnerConfig({ url, token })');
    }
    this.baseUrl = url;
    this.authToken = cfg.remoteRunnerToken;
  }

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    const { promise } = this.runWithController(blueprint, execution, config);
    return await promise;
  }

  /**
   * Execute with cancellation controller returned to caller.
   * This allows the caller to cancel in-flight requests.
   */
  runWithController(
    blueprint: Blueprint,
    execution: Execution,
    config?: EngineConfig
  ): { promise: Promise<ExecutionItem[]>; cancel: () => void } {
    const requestId = nanoid();
    const payload: Record<string, unknown> = {
      blueprint_json: JSON.stringify(blueprint),
      execution_json: JSON.stringify(execution),
      config_json: JSON.stringify({ ...(config || {}), eventCallback: undefined }),
      request_id: requestId,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    let abortController: AbortController | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let cancelled = false;

    const cancel = () => {
      cancelled = true;
      console.log('[STOP-DEBUG] RemoteRunner: Cancelling request', { requestId });
      if (abortController) {
        abortController.abort();
      }
      if (reader) {
        reader.cancel().catch(() => {
          // ignore
        });
      }
    };

    const promise = (async (): Promise<ExecutionItem[]> => {
      // If the caller provided an eventCallback, prefer SSE streaming endpoint
      if (config?.eventCallback) {
        abortController = new AbortController();
        const streamUrl = `${this.baseUrl}/runner.Runner/ExecuteStream`;
        const streamRes = await fetch(streamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });
        if (!streamRes.ok || !streamRes.body) {
          throw new Error(`Remote runner stream error: ${streamRes.status} ${streamRes.statusText}`);
        }

        reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: ExecutionItem[] | undefined = undefined;
        let fatalStreamError: Error | undefined = undefined;

        type CompletedPayload = { duration_ms?: number; result_json?: string };
        type ErrorPayload = { error?: { message?: string } };

        const emit = async (name: 'message' | 'completed' | 'error', data: unknown) => {
          if (name === 'message') {
            try {
              await config.eventCallback!(data as AutopilotEvent);
            } catch (e) {
              // Non-fatal: don't let a bad consumer callback break execution
              console.error('[RemoteRunner] SSE event dispatch failed', e);
            }
            return;
          }

          if (name === 'completed') {
            const env = data as CompletedPayload;
            const parsed = typeof env?.result_json === 'string' ? JSON.parse(env.result_json) : undefined;
            if (Array.isArray(parsed)) finalResult = parsed as ExecutionItem[];
            return;
          }

          // name === 'error' must be fatal to the caller; do NOT swallow.
          const env = data as ErrorPayload;
          throw new Error(String(env?.error?.message || 'stream error'));
        };

        // Minimal SSE parser

        while (true) {
          if (cancelled) {
            throw new Error('Remote runner execution cancelled');
          }

          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            // parse single event block
            const lines = raw.split('\n');
            let eventName: 'message' | 'completed' | 'error' = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event:')) {
                const maybe = line.slice(6).trim();
                if (maybe === 'message' || maybe === 'completed' || maybe === 'error') {
                  eventName = maybe;
                } else {
                  eventName = 'message';
                }
              } else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
            }
            if (dataStr) {
              let data: unknown;
              try {
                data = JSON.parse(dataStr);
              } catch (e) {
                // Non-fatal: malformed JSON in stream; log and keep parsing.
                console.error('[RemoteRunner] SSE parse error', e);
                continue;
              }

              try {
                // Check for cancellation before processing each event
                if (cancelled) {
                  throw new Error('Remote runner execution cancelled');
                }
                await emit(eventName, data);
              } catch (e) {
                // Important: 'error' events are fatal to the caller; do not swallow them.
                if (eventName === 'error') {
                  fatalStreamError = e instanceof Error ? e : new Error(String(e));
                  try {
                    await reader.cancel();
                  } catch {
                    // ignore
                  }
                  break;
                }
                // If cancellation error, propagate it
                if (e instanceof Error && (e.message.includes('cancelled') || e.message.includes('aborted'))) {
                  throw e;
                }
                console.error('[RemoteRunner] SSE event handler error', e);
              }
            }

            // Check for cancellation after processing each event block
            if (cancelled) {
              throw new Error('Remote runner execution cancelled');
            }

            if (fatalStreamError) break;
          }

          if (fatalStreamError) break;
        }

        if (cancelled) {
          throw new Error('Remote runner execution cancelled');
        }

        if (fatalStreamError) {
          throw fatalStreamError;
        }

        // If the stream ended without a completed payload, treat as an error.
        // This prevents silent "success" with [] when the runner dies mid-stream.
        if (!Array.isArray(finalResult)) {
          throw new Error('Remote runner stream ended without a completed result');
        }
        return finalResult;
      }

      // Non-streaming fallback
      abortController = new AbortController();
      const execUrl = `${this.baseUrl}/runner.Runner/Execute`;
      const res = await fetch(execUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
      if (cancelled) {
        throw new Error('Remote runner execution cancelled');
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Remote runner error: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
      }
      const body = (await res.json()) as { result_json?: string };
      const result = body?.result_json ? JSON.parse(body.result_json) : undefined;
      return Array.isArray(result) ? (result as ExecutionItem[]) : [];
    })();

    return { promise, cancel };
  }
}
