## Example 02 — LLM with upstream input

Goal: Use upstream input as the user message by explicitly constructing the LLM `messages` array.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'AI',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        // Explicitly construct messages from the initial input
        messages: [
          {
            role: 'user',
            content: '{{ String(input ?? "") }}',
          },
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("llm") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine();
// Provide an initial input string; Start will pass it through
const exec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle('What is 2+2?'));
const out = await engine.executeBlueprint(blueprint, exec);
// LLM receives a single user message with content "What is 2+2?"
```
