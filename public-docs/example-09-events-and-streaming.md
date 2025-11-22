## Example 09 — Streaming and events

Goal: Capture `content_chunk`, `content_complete`, and `tool_call_detected` events.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const events: Array<{ type: string; data: unknown }> = [];
const eventCallback = async (evt) => {
  // evt: { type, timestamp, executionDepth, data }
  events.push({ type: evt.type, data: evt.data });
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
        messages: [{ role: 'user', content: 'Say hello in two short sentences.' }],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("llm") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine({ eventCallback });
const exec = ExecutionItemUtils.createExecution();
await engine.executeBlueprint(blueprint, exec);

// events now contains a timeline including:
// - workflow_started, node_started (llm), content_chunk*, content_complete, node_completed, workflow_completed
```

