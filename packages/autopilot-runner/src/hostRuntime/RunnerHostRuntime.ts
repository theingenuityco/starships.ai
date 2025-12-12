import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import OpenAI from 'openai';

/**
 * HostRuntime implementation for the autopilot-runner process.
 *
 * This is responsible for:
 * - Performing HTTP calls on behalf of HttpRequest nodes
 * - Executing LLM calls via OpenRouter (or other providers in the future)
 *
 * NOTE: This implementation is runner-local; it does not know about Starships
 * connectors or per-starship encrypted environments. Those remain a concern of
 * the API server-side HostRuntime used by ConnectorRuntimeService.
 */
export function createRunnerHostRuntime(): HostRuntime {
  const http: HostRuntime['http'] = async ({ method, url, headers = {}, body, timeoutMs }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const finalMethod = method.toUpperCase();
      const init: { [key: string]: unknown } = {
        method: finalMethod,
        headers: headers as Record<string, string>,
        signal: controller.signal,
      };

      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        if (typeof body === 'string') {
          init.body = body;
        } else if (body && typeof body === 'object') {
          init.body = JSON.stringify(body);
          init.headers = {
            'content-type': 'application/json',
            ...(init.headers as Record<string, string>),
          };
        }
      }

      const resp: { [key: string]: any } = await (globalThis as any).fetch(url, init);
      const contentType = resp.headers?.get?.('content-type') || '';
      let responseBody: unknown;

      if (contentType.includes('application/json')) {
        try {
          responseBody = await resp.json();
        } catch {
          responseBody = await resp.text();
        }
      } else {
        responseBody = await resp.text();
      }

      const responseHeaders: Record<string, unknown> = {};
      if (resp.headers && typeof resp.headers.forEach === 'function') {
        resp.headers.forEach((value: string, key: string) => {
          responseHeaders[key] = value;
        });
      }

      return {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
        body: responseBody,
        url: resp.url,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const llm = async (request: LlmHostRequest): Promise<AsyncIterable<unknown>> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key is required. Set OPENROUTER_API_KEY in the runner environment.');
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://starships.ai',
        'X-Title': 'Starships.ai',
      },
    });

    const openaiRequest: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: true },
    };

    if (typeof request.temperature === 'number') {
      openaiRequest.temperature = request.temperature;
    }
    if (typeof request.maxTokens === 'number') {
      openaiRequest.max_tokens = request.maxTokens;
    }
    if (typeof request.topP === 'number') {
      openaiRequest.top_p = request.topP;
    }
    if (typeof request.frequencyPenalty === 'number') {
      openaiRequest.frequency_penalty = request.frequencyPenalty;
    }
    if (typeof request.presencePenalty === 'number') {
      openaiRequest.presence_penalty = request.presencePenalty;
    }
    if (request.reasoning && typeof request.reasoning === 'object') {
      (openaiRequest as OpenAI.Chat.ChatCompletionCreateParamsStreaming & { reasoning?: unknown }).reasoning = request.reasoning;
    }

    // Tools are currently passed as-is; this can be extended to convert
    // ToolParams into provider-native tool definitions when needed.
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      (openaiRequest as any).tools = request.tools;
    }

    const stream = await client.chat.completions.create(openaiRequest);
    return stream as AsyncIterable<unknown>;
  };

  return { http, llm };
}
