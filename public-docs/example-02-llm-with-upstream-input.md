## Example 02 — LLM with upstream input fallback

Goal: Use upstream input as the user message when `messages` is omitted or empty.

Notes

- Start passes through initial input.
- LLM node uses upstream input when `messages` are not provided or empty.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    { ref: 'llm', type: 'llm', name: 'AI', parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [] } },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine({ secureEnv: { OPEN_ROUTER_KEY: process.env.OPEN_ROUTER_KEY! } });
// Provide an initial input string; Start will pass it through
const exec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle('What is 2+2?'));
const out = await engine.executeBlueprint(blueprint, exec);
// LLM receives a single user message with content "What is 2+2?"
```
