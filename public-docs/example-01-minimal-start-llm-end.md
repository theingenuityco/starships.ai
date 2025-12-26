## Example 01 — Minimal: start → llm → end

Goal: Smallest useful blueprint that streams a model response and returns it via End.

Requirements

- For standalone SDK usage, you must provide:
  - `OPENROUTER_API_KEY` (in your process env)
  - a `hostRuntime.llm` implementation (below uses the OpenAI SDK pointed at OpenRouter)

Code

```ts
import OpenAI from 'openai';
import { Engine, ExecutionItemUtils, type HostRuntime } from '@starships/autopilot';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });

const hostRuntime: HostRuntime = {
  http: async () => {
    throw new Error('HostRuntime.http not configured for this example');
  },
  connectorAction: async () => {
    throw new Error('HostRuntime.connectorAction not configured for this example');
  },
  llm: async (req) => {
    // The LLM node expects an AsyncIterable of provider-native streaming chunks.
    return await openai.chat.completions.create({
      model: req.model,
      messages: req.messages as any,
      stream: true,
    });
  },
};

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
      parameters: { output: '{{ lastOutputOf("llm") }}' },
    },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// out[0].json → LLMResponse
```
