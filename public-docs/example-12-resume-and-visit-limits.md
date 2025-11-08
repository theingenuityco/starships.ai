## Example 12 — Resume and visit limits

Goal: Resume a paused execution and demonstrate visit-count limits for cycles.

Resume

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    { ref: 'llm', type: 'llm', name: 'AI', parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Hello' }] } },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine({ secureEnv: { OPEN_ROUTER_KEY: process.env.OPEN_ROUTER_KEY! } });
const exec = ExecutionItemUtils.createExecution();
// First run partially:
await engine.executeBlueprint(blueprint, exec);
engine.pause(exec);
// ... persist `exec` externally ...
// Later, resume from current node:
engine.resume(exec);
await engine.executeBlueprint(blueprint, exec);
```

Visit limits (cycle)

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    { ref: 'cond', type: 'conditional', name: 'Loop', parameters: { condition: 'continue' } },
    { ref: 'e', type: 'end', name: 'End', parameters: {} },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'cond' },
    { ref: 'e2', from: 'cond', to: 'cond', condition: 'continue' }, // self-loop
    { ref: 'e3', from: 'cond', to: 'e', condition: 'stop' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// Engine caps visits per node (config.MAX_NODE_VISITS). When exceeded, workflow completes gracefully.
```

