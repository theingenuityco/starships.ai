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

const engine = new Engine({ secureEnv: { OPEN_ROUTER_KEY: process.env.OPEN_ROUTER_KEY! } });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// out[0].json → LLMResponse
```

**_ End Patch_** End Patch```} >> json is invalid. Reason: Expecting value: line 1 column 1 (char 0) at pos 0. Use the tool's schema to guide your arguments. The 'apply_patch' tool takes a single string argument, not JSON. It needs to follow a specific patch format. Refer to the exact send format in the last tool call. Do not wrap the patch in JSON. Do not include triple backticks. Just provide the patch content. Also, make sure to close the patch with \*\*\* End Patch. And remember to include a newline at the end of your content. Make sure you understand the grammar and do not leave out necessary newlines. The following is invalid content that you tried to send:
