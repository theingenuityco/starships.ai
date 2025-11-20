## Example 03 — Function calling with a basic tool

Goal: Let the model call a calculator tool. Tool enforces object arguments.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

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
            const { a, b } = ctx.$input || {};
            return { sum: Number(a) + Number(b) };
          }
        `,
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("add")?.[0]?.json }}' } },
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
          '{{ (() => { const calls = $lastOutputOf("llm")?.[0]?.json?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length>0 ? "call" : "complete"; })() }}',
      },
    },
    {
      ref: 'args',
      type: 'code',
      name: 'Prepare Args',
      parameters: {
        code: `
          async function main(ctx) {
            const last = ctx.$lastOutputOf("llm")[0]?.json;
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
            const toolResult = ctx.$lastOutputOf("tool")[0]?.json ?? {};
            const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            const next = { ...(state || {}) };
            next.messages = [...(state?.messages ?? []), { role: 'tool', content }];
            return next;
          }
          `,
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' } },
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

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```

