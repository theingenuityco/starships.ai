## Example 10 — Kitchen sink

Goal: Combine HTTP → Transform → LLM+Tools → Conditional → Tool → Mutate → LLM → End with inline ops sprinkled in.

Code (abridged)

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

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
            const { text } = ctx.$input || {};
            return { echoed: String(text ?? "") };
          }
        `,
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("code")?.[0]?.json }}' } },
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
        transforms: [{ operation: 'add', path: '/title', value: '{{ $input()?.body?.title }}' }],
      },
    },
    {
      ref: 'summarize',
      type: 'llm',
      name: 'Summarize',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Summarize: {{ $lastOutputOf("http")?.[0]?.json?.body?.title }}' }],
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
          '{{ (() => { const calls=$lastOutputOf("summarize")?.[0]?.json?.choices?.[0]?.message?.toolCalls; return (Array.isArray(calls)&&calls.length>0) ? "call" : "complete"; })() }}',
      },
    },
    {
      ref: 'args',
      type: 'code',
      name: 'Args',
      parameters: {
        code: `
          async function main(ctx) {
            const c = ctx.$lastOutputOf("summarize")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.function?.arguments;
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
            const r = ctx.$lastOutputOf("tool")[0]?.json ?? {};
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
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("final")?.[0]?.json }}' } },
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

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```
