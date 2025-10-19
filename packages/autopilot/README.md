# @starships/autopilot

Workflow engine library for building and executing DAGs with LLM/tool/HTTP nodes. Used by the API server and UI.

## Quick start

```bash
pnpm add @starships/autopilot
```

Minimal blueprint (start → llm → end):

```typescript
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 'start', type: 'start', name: 'Begin', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'Respond',
      parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Hello' }] },
    },
    { ref: 'end', type: 'end', name: 'Done', parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' } },
  ],
  edges: [
    { ref: 'e1', from: 'start', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'end' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
const final = await engine.executeBlueprint(blueprint, exec);
```

Blueprint Builder example:

```typescript
import { BlueprintBuilder, Engine, ExecutionItemUtils } from '@starships/autopilot';

const b = new BlueprintBuilder();
const s = b.addNode({ type: 'start', name: 'Begin', parameters: {} });
const l = b.addNode({
  type: 'llm',
  name: 'AI',
  parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Hi' }] },
});
const e = b.addNode({ type: 'end', name: 'End', parameters: {} });
const bp = b.addEdge(s, l).addEdge(l, e).build();

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution();
await engine.executeBlueprint(bp, exec);
```

## Error handling

- Default: fail on first node error
- Resilient mode: `new Engine({ failOnNodeError: false })`
- All errors still recorded in `execution.results`

## Tool calling

Use the `tool` node to expose functions (calculator, get_current_time, echo). See `README-TOOLS.md`.

## Events & streaming

Subscribe via `eventCallback` for `workflow_*`, `node_*`, and `content_chunk` events.

## Integration notes

- Credentials (OpenAI/Anthropic) are provided by host app; Autopilot focuses on execution
- Used by `@starships/server` conversation pipeline; no standalone HTTP `/workflows/execute` route in server

## Links

- Tools guide: `./README-TOOLS.md`
- Template expressions: `./README-EVAL.md`
- Root: `../../README.md`
