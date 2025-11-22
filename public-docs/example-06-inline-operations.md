## Example 06 — Inline operations (transforms, reducers, condition)

Goal: Use inline transforms/reducers/condition on a non-dedicated node. Engine runs them post-handler in that order.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

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
        transforms: [
          // Inline: runs AFTER http handler; input is http node output
          { operation: 'add', path: '/title', value: '{{ input?.body?.title }}' },
        ],
        reducers: [
          `
          (state, ctx) => {
            const next = { ...(state || {}) };
            next.meta = { fetchedAt: new Date().toISOString() };
            return next;
          }
          `,
        ],
        condition: '{{ exists(input?.body?.id) ? "ok" : "missing" }}',
      },
    },
    { ref: 'ok', type: 'end', name: 'OK', parameters: { output: 'ok' } },
    { ref: 'missing', type: 'end', name: 'Missing', parameters: { output: 'missing' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'ok', condition: 'ok' },
    { ref: 'e3', from: 'http', to: 'missing', condition: 'missing' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```

