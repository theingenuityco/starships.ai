# @starships/autopilot

Workflow engine library for building and executing DAGs with LLM/tool/HTTP nodes. Used by the API server and UI.

## Quick start

```bash
pnpm add @starships/autopilot
# For the example hostRuntime.llm below:
pnpm add openai
```

Minimal blueprint (start → llm → end).

Note: the `llm` node requires a host-provided `hostRuntime.llm` implementation.

```typescript
import OpenAI from 'openai';
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });

const hostRuntime = {
  http: async () => {
    throw new Error('HostRuntime.http not configured for this example');
  },
  connectorAction: async () => {
    throw new Error('HostRuntime.connectorAction not configured for this example');
  },
  llm: async (req: any) => {
    const tools =
      Array.isArray(req.tools) && req.tools.length
        ? req.tools.map((t: any) => ({
            type: 'function',
            function: {
              name: (typeof t.slug === 'string' && t.slug.trim().length ? t.slug : t.name) || 'tool',
              description: typeof t.description === 'string' ? t.description : '',
              parameters: t.parameters,
            },
          }))
        : undefined;
    return await openai.chat.completions.create({
      model: req.model,
      messages: req.messages,
      tools,
      stream: true,
    });
  },
};

const blueprint = {
  nodes: [
    { ref: 'start', type: 'start', name: 'Begin', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'Respond',
      parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Hello' }] },
    },
    { ref: 'end', type: 'end', name: 'Done', parameters: { output: '{{ lastOutputOf("llm") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 'start', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'end' },
  ],
};

const engine = new Engine({ hostRuntime });
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
