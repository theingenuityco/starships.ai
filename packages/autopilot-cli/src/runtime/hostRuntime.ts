import OpenAI from 'openai';
import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';

export type LocalRuntimeOptions = {
  openRouterApiKey?: string;
  openRouterBaseUrl?: string;
};

function getHeaderRecord(headers: Headers): Record<string, unknown> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function withTimeoutSignal(timeoutMs: number | undefined): { signal?: AbortSignal; cancel: () => void } {
  const ms = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0;
  if (ms <= 0) return { signal: undefined, cancel: () => {} };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`Timeout after ${ms}ms`)), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

async function readResponseBody(resp: Response, responseType?: 'json' | 'text' | 'arrayBuffer' | 'base64'): Promise<unknown> {
  const rt = responseType ?? 'json';
  if (rt === 'arrayBuffer') return await resp.arrayBuffer();
  if (rt === 'text') return await resp.text();
  if (rt === 'base64') {
    const ab = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') ?? 'application/octet-stream';
    const b64 = Buffer.from(ab).toString('base64');
    return `data:${ct};base64,${b64}`;
  }
  // json (default): best-effort parse, fall back to text
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function wrapNonStreamAsOneChunk(completion: Record<string, unknown>, canonicalModel?: string): AsyncIterable<unknown> {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const oneChunk = {
    id: completion.id,
    object: completion.object ?? 'chat.completion',
    created: completion.created ?? Math.floor(Date.now() / 1000),
    model: typeof canonicalModel === 'string' && canonicalModel.trim().length > 0 ? canonicalModel : completion.model,
    usage: completion.usage,
    choices: [
      {
        index: 0,
        message: firstChoice?.message,
        finish_reason: firstChoice?.finish_reason ?? 'stop',
      },
    ],
  };
  async function* gen() {
    yield oneChunk;
  }
  return gen();
}

export function createLocalHostRuntime(options: LocalRuntimeOptions = {}): HostRuntime {
  const apiKey = options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseURL = options.openRouterBaseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  const openai = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

  return {
    async http(request) {
      const { signal, cancel } = withTimeoutSignal(request.timeoutMs);
      try {
        const headers: Record<string, string> = {};
        if (request.headers) {
          for (const [k, v] of Object.entries(request.headers)) {
            if (typeof v === 'string') headers[k] = v;
            else if (typeof v === 'number' || typeof v === 'boolean') headers[k] = String(v);
          }
        }

        const resp = await fetch(request.url, {
          method: request.method,
          headers,
          body:
            request.body === undefined || request.body === null
              ? undefined
              : typeof request.body === 'string'
                ? request.body
                : request.body instanceof ArrayBuffer
                  ? request.body
                  : JSON.stringify(request.body),
          signal,
        });

        const body = await readResponseBody(resp, request.responseType);
        return {
          status: resp.status,
          statusText: resp.statusText,
          headers: getHeaderRecord(resp.headers),
          body,
          url: resp.url,
        };
      } finally {
        cancel();
      }
    },

    async connectorAction(request) {
      throw new Error(
        `connector_action is not supported in local mode (connector=${request.connector}, action=${request.action}). ` +
          `Use http_request nodes instead, or run in a mode with connector sessions/templates.`
      );
    },

    async llm(request: LlmHostRequest) {
      if (!openai) {
        throw new Error('OPENROUTER_API_KEY (or OPENAI_API_KEY) is required to run LLM nodes.');
      }

      const tools = Array.isArray(request.tools)
        ? request.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.slug,
              description: t.description,
              parameters: t.parameters as unknown as Record<string, unknown>,
            },
          }))
        : undefined;

      const wantsStream = typeof request.stream === 'boolean' ? request.stream : true;
      if (wantsStream) {
        return (await openai.chat.completions.create({
          model: request.model,
          messages: request.messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
          ...(tools && tools.length ? { tools } : {}),
          ...(typeof request.temperature === 'number' ? { temperature: request.temperature } : {}),
          ...(typeof request.maxTokens === 'number' ? ({ max_tokens: request.maxTokens } as unknown as object) : {}),
          ...(typeof request.topP === 'number' ? ({ top_p: request.topP } as unknown as object) : {}),
          ...(typeof request.frequencyPenalty === 'number'
            ? ({ frequency_penalty: request.frequencyPenalty } as unknown as object)
            : {}),
          ...(typeof request.presencePenalty === 'number' ? ({ presence_penalty: request.presencePenalty } as unknown as object) : {}),
          ...(request.responseFormat ? ({ response_format: request.responseFormat } as unknown as object) : {}),
          ...(Array.isArray(request.modalities) && request.modalities.length ? ({ modalities: request.modalities } as unknown as object) : {}),
          ...(request.imageConfig ? ({ image_config: request.imageConfig } as unknown as object) : {}),
          ...(Array.isArray(request.plugins) && request.plugins.length ? ({ plugins: request.plugins } as unknown as object) : {}),
          stream: true,
        })) as unknown as AsyncIterable<unknown>;
      }

      const completion = (await openai.chat.completions.create({
        model: request.model,
        messages: request.messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
        ...(tools && tools.length ? { tools } : {}),
        ...(typeof request.temperature === 'number' ? { temperature: request.temperature } : {}),
        ...(typeof request.maxTokens === 'number' ? ({ max_tokens: request.maxTokens } as unknown as object) : {}),
        ...(request.responseFormat ? ({ response_format: request.responseFormat } as unknown as object) : {}),
        ...(Array.isArray(request.modalities) && request.modalities.length ? ({ modalities: request.modalities } as unknown as object) : {}),
        ...(request.imageConfig ? ({ image_config: request.imageConfig } as unknown as object) : {}),
        ...(Array.isArray(request.plugins) && request.plugins.length ? ({ plugins: request.plugins } as unknown as object) : {}),
        stream: false,
      })) as unknown as Record<string, unknown>;

      return wrapNonStreamAsOneChunk(completion, request.model);
    },
  };
}

