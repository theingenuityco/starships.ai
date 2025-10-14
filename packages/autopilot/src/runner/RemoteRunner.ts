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
    const requestId = nanoid();
    const payload: Record<string, unknown> = {
      blueprint_json: JSON.stringify(blueprint),
      execution_json: JSON.stringify(execution),
      config_json: JSON.stringify({ ...(config || {}), eventCallback: undefined }),
      request_id: requestId,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    // If the caller provided an eventCallback, prefer SSE streaming endpoint
    if (config?.eventCallback) {
      const streamUrl = `${this.baseUrl}/runner.Runner/ExecuteStream`;
      const streamRes = await fetch(streamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!streamRes.ok || !streamRes.body) {
        throw new Error(`Remote runner stream error: ${streamRes.status} ${streamRes.statusText}`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ExecutionItem[] | undefined = undefined;

      type CompletedPayload = { duration_ms?: number; result_json?: string };
      type ErrorPayload = { error?: { message?: string } };

      const emit = async (name: 'message' | 'completed' | 'error', data: unknown) => {
        try {
          if (name === 'message') {
            await config.eventCallback!(data as AutopilotEvent);
          } else if (name === 'completed') {
            const env = data as CompletedPayload;
            const parsed = typeof env?.result_json === 'string' ? JSON.parse(env.result_json) : undefined;
            if (Array.isArray(parsed)) finalResult = parsed as ExecutionItem[];
          } else if (name === 'error') {
            const env = data as ErrorPayload;
            throw new Error(String(env?.error?.message || 'stream error'));
          }
        } catch (e) {
          console.error('[RemoteRunner] SSE event dispatch failed', e);
        }
      };

      // Minimal SSE parser

      while (true) {
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
            try {
              const data = JSON.parse(dataStr);
              await emit(eventName, data);
            } catch (e) {
              console.error('[RemoteRunner] SSE parse error', e);
            }
          }
        }
      }

      return Array.isArray(finalResult) ? finalResult : [];
    }

    // Non-streaming fallback
    const execUrl = `${this.baseUrl}/runner.Runner/Execute`;
    const res = await fetch(execUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Remote runner error: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
    }
    const body = (await res.json()) as { result_json?: string };
    const result = body?.result_json ? JSON.parse(body.result_json) : undefined;
    return Array.isArray(result) ? (result as ExecutionItem[]) : [];
  }
}
