## Example 12 — Resume and visit limits

Goal: Resume a paused execution and demonstrate visit-count limits for cycles.

Resume

```ts
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
  llm: async (req) => {
    const request = {
      model: req.model,
      messages: req.messages,
      stream: true,
      // Optional OpenRouter image generation support
      ...(Array.isArray(req.modalities) && req.modalities.length > 0 ? { modalities: req.modalities } : {}),
      ...(req.imageConfig && typeof req.imageConfig === 'object' ? { image_config: req.imageConfig } : {}), // OpenRouter expects snake_case
    };

    return await openai.chat.completions.create(request);
  },
};

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    { ref: 'llm', type: 'llm', name: 'AI', parameters: { model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Hello' }] } },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("llm") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();

// Resume is driven by `execution.currentNodeRef`. If set, Engine starts from that node.
// Pausing is best done from an `eventCallback` while the workflow is running.
const eventCallback = async (evt) => {
  if (evt.type === 'node_completed' && evt.data?.execution?.currentNodeRef === 's') {
    // Pause after Start finishes so the next Engine call can "resume" at llm.
    engine.pause(evt.data.execution);
    // IMPORTANT: Engine.pause() pauses *the execution*, but Engine.currentNodeRef points at the last executed node.
    // For a linear flow like start -> llm -> end, set the next node explicitly before persisting.
    evt.data.execution.currentNodeRef = 'llm';
  }
};

const engineWithPause = new Engine({ hostRuntime, eventCallback });
await engineWithPause.executeBlueprint(blueprint, exec);

// ... persist `exec` externally (it now has currentNodeRef = 'llm') ...

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

