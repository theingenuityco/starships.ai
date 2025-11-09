## Example 04 — HTTP request followed by Transform

Goal: Call an external API and reshape the response before returning it.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'http',
      type: 'http_request',
      name: 'Fetch Post',
      parameters: {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        timeout: 10000,
      },
    },
    {
      ref: 'shape',
      type: 'transform',
      name: 'Pick fields',
      parameters: {
        transforms: [
          { operation: 'add', path: '/id', value: '{{ $input()?.body?.id }}' },
          { operation: 'add', path: '/title', value: '{{ $input()?.body?.title }}' },
          { operation: 'remove', path: '/debug' },
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("shape")?.[0]?.json }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'shape' },
    { ref: 'e3', from: 'shape', to: 'e' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// out[0].json → { id, title }
```

