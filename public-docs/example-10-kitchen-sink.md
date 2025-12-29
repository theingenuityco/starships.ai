## Example 10 — Kitchen sink

Goal: Combine HTTP → Transform → LLM+Tools → Conditional → Tool → Mutate → LLM → End with inline ops sprinkled in.

Code (abridged)

```ts
import OpenAI from 'openai';
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });

const hostRuntime = {
  http: async ({ method, url, headers = {}, body, timeoutMs }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const finalMethod = String(method || 'GET').toUpperCase();
      const init = { method: finalMethod, headers, signal: controller.signal };
      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        const h = new Headers(init.headers);
        if (typeof body !== 'string' && !h.has('content-type')) h.set('content-type', 'application/json');
        init.headers = h;
      }
      const resp = await fetch(url, init);
      const contentType = resp.headers.get('content-type') || '';
      const respBody = contentType.includes('application/json') ? await resp.json().catch(() => resp.text()) : await resp.text();
      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => (responseHeaders[k] = v));
      return { status: resp.status, statusText: resp.statusText, headers: responseHeaders, body: respBody, url: resp.url };
    } finally {
      clearTimeout(t);
    }
  },
  connectorAction: async () => {
    throw new Error('HostRuntime.connectorAction not configured for this example');
  },
  llm: async (req) => {
    const tools =
      Array.isArray(req.tools) && req.tools.length
        ? req.tools.map((t) => ({
            type: 'function',
            function: {
              name: t.slug || t.name || 'tool',
              description: t.description || '',
              parameters: t.parameters,
            },
          }))
        : undefined;

    const request = {
      model: req.model,
      messages: req.messages,
      tools,
      stream: true,
      // Optional OpenRouter image generation support
      ...(Array.isArray(req.modalities) && req.modalities.length > 0 ? { modalities: req.modalities } : {}),
      ...(req.imageConfig && typeof req.imageConfig === 'object' ? { image_config: req.imageConfig } : {}), // OpenRouter expects snake_case
    };

    return await openai.chat.completions.create(request);
  },
};

const toolEcho = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'code',
      type: 'code',
      name: 'Echo',
      parameters: {
        code: `
          async function main(ctx) {
            const { text } = ctx.input || {};
            return { echoed: String(text ?? "") };
          }
        `,
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("code") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'code' },
    { ref: 'e2', from: 'code', to: 'e' },
  ],
};

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'http',
      type: 'http_request',
      name: 'Fetch',
      parameters: {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        transforms: [{ operation: 'add', path: '/title', value: '{{ input?.body?.title }}' }],
      },
    },
    {
      ref: 'summarize',
      type: 'llm',
      name: 'Summarize',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        // Full-only templates: the entire string must be a single {{ ... }} expression.
        messages: [{ role: 'user', content: `{{ "Summarize: " + String(lastOutputOf("http")?.body?.title ?? "") }}` }],
        tools: [
          {
            name: 'Echo',
            slug: 'echo',
            description: 'Echo input',
            parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            blueprint: toolEcho,
          },
        ],
      },
    },
    {
      ref: 'cond',
      type: 'conditional',
      name: 'Tool?',
      parameters: {
        condition:
          '{{ (() => { const last=lastOutputOf("summarize") || {}; const calls=last?.choices?.[0]?.message?.toolCalls; return (Array.isArray(calls)&&calls.length>0) ? "call" : "complete"; })() }}',
      },
    },
    {
      ref: 'args',
      type: 'code',
      name: 'Args',
      parameters: {
        code: `
          async function main(ctx) {
            const last = ctx.lastOutputOf("summarize") || {};
            const c = last?.choices?.[0]?.message?.toolCalls?.[0]?.function?.arguments;
            return typeof c === 'string' ? JSON.parse(c) : (c || {});
          }
        `,
      },
    },
    {
      ref: 'tool',
      type: 'tool',
      name: 'Echo Tool',
      parameters: {
        name: 'Echo',
        slug: 'echo',
        description: 'Echo input text',
        parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        blueprint: toolEcho,
      },
    },
    {
      ref: 'mut',
      type: 'mutate',
      name: 'Add Tool Msg',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const r = ctx.lastOutputOf("tool") ?? {};
            const content = JSON.stringify(r);
            const next = { ...(state || {}) };
            next.messages = [...(state?.messages ?? []), { role: 'tool', content }];
            return next;
          }
          `,
        ],
      },
    },
    {
      ref: 'final',
      type: 'llm',
      name: 'Final Answer',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'Use the previous tool outputs to produce the final answer.' },
          { role: 'user', content: 'Finish the task.' },
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("final") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'summarize' },
    { ref: 'e3', from: 'summarize', to: 'cond' },
    { ref: 'e4', from: 'cond', to: 'args', condition: 'call' },
    { ref: 'e5', from: 'args', to: 'tool' },
    { ref: 'e6', from: 'tool', to: 'mut' },
    { ref: 'e7', from: 'mut', to: 'final' },
    { ref: 'e8', from: 'cond', to: 'final', condition: 'complete' },
    { ref: 'e9', from: 'final', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```
