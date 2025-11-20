## Example 01 — Minimal: start → llm → end

Goal: Smallest useful blueprint that streams a model response and returns it via End.

Requirements

- Secure env must include `OPEN_ROUTER_KEY`.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'Respond',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello there!' }],
      },
    },
    {
      ref: 'e',
      type: 'end',
      name: 'Done',
      parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' },
    },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// out[0].json → LLMResponse
```
