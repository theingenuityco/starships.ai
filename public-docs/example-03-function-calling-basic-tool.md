## Example 03 — Function calling with a basic tool

Goal: Let the model call a calculator tool. Tool enforces object arguments.

Code

```ts
import OpenAI from 'openai';
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });

const hostRuntime = {
  http: async () => {
    throw new Error('HostRuntime.http not configured for this example');
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

const toolBlueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'add',
      type: 'code',
      name: 'Add',
      parameters: {
        code: `
          async function main(ctx) {
            const { a, b } = ctx.input || {};
            return { sum: Number(a) + Number(b) };
          }
        `,
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("add") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'add' },
    { ref: 'e2', from: 'add', to: 'e' },
  ],
};

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'AI',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Add 7 and 35' }],
        tools: [
          {
            name: 'Calculator',
            slug: 'calculator',
            description: 'Add two numbers',
            parameters: {
              type: 'object',
              properties: { a: { type: 'number' }, b: { type: 'number' } },
              required: ['a', 'b'],
            },
            blueprint: toolBlueprint,
          },
        ],
      },
    },
    {
      ref: 'cond',
      type: 'conditional',
      name: 'Has Tool?',
      parameters: {
        condition:
          '{{ (() => { const last = lastOutputOf("llm") || {}; const calls = last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length>0 ? "call" : "complete"; })() }}',
      },
    },
    {
      ref: 'args',
      type: 'code',
      name: 'Prepare Args',
      parameters: {
        code: `
          async function main(ctx) {
            const last = ctx.lastOutputOf("llm") || {};
            const s = last?.choices?.[0]?.message?.toolCalls?.[0]?.function?.arguments;
            return typeof s === 'string' ? JSON.parse(s) : (s || {});
          }
        `,
      },
    },
    {
      ref: 'tool',
      type: 'tool',
      name: 'Execute',
      parameters: {
        name: '{{ state.tools?.[0]?.name ?? "Calculator" }}',
        slug: 'calculator',
        description: 'Add two numbers',
        parameters: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b'],
        },
        blueprint: toolBlueprint,
      },
    },
    {
      ref: 'mut',
      type: 'mutate',
      name: 'Append Tool Result',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const toolResult = ctx.lastOutputOf("tool") ?? {};
            const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            const next = { ...(state || {}) };
            next.messages = [...(state?.messages ?? []), { role: 'tool', content }];
            return next;
          }
          `,
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("llm") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'cond' },
    { ref: 'e3', from: 'cond', to: 'args', condition: 'call' },
    { ref: 'e4', from: 'args', to: 'tool' },
    { ref: 'e5', from: 'tool', to: 'mut' },
    { ref: 'e6', from: 'mut', to: 'llm' },
    { ref: 'e7', from: 'cond', to: 'e', condition: 'complete' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```
