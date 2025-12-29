## Example 13 — LLM image generation (OpenRouter)

Goal: Request an image from an OpenRouter image-capable model using the LLM node’s `modalities` + `imageConfig`.

Key points

- The LLM node passes `modalities` and `imageConfig` to `hostRuntime.llm(...)`.
- If you call OpenRouter via the OpenAI SDK, map `imageConfig` → `image_config` (snake_case) on the outbound request.
- OpenRouter typically returns generated images on the assistant message under `images[]`, where each item often looks like:
  - `{ image_url: { url: "data:image/png;base64,..." } }`
- In the Starships hosted product, those base64 data URLs are automatically stored as **attachments** (so they do not bloat message rows).

Code

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
    // Pass through OpenRouter’s image generation fields.
    // - modalities: ['image','text']
    // - image_config: { aspect_ratio: '1:1', ... }
    const request = {
      model: req.model,
      messages: req.messages,
      stream: true,
      ...(Array.isArray(req.modalities) && req.modalities.length > 0 ? { modalities: req.modalities } : {}),
      ...(req.imageConfig && typeof req.imageConfig === 'object' ? { image_config: req.imageConfig } : {}), // OpenRouter expects snake_case
    };

    return await openai.chat.completions.create(request);
  },
};

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'img',
      type: 'llm',
      name: 'Generate image',
      parameters: {
        // Pick an image-capable model on OpenRouter
        model: 'openai/gpt-image-1',
        messages: [{ role: 'user', content: 'Generate a clean product photo of a red starship on a white background.' }],
        modalities: ['image', 'text'],
        imageConfig: { aspect_ratio: '1:1' },
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("img") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'img' },
    { ref: 'e2', from: 'img', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);

// out[0].json → LLMResponse (provider fields may include `choices[0].message.images`)
// In Starships hosted chat, the generated image will appear as an attachment on the assistant message.
console.log(JSON.stringify(out[0].json, null, 2));
```


