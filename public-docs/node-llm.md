## Node: LLM

What it is: Streams model outputs via OpenRouter (OpenAI-compatible API) with reliable accumulation and function calling. Normalizes message/tool formats and usage accounting.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/LLM.ts`
- Requires secure env `OPEN_ROUTER_KEY` provided via `Engine({ secureEnv })`.
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - model: string (required) — e.g., "anthropic/claude-3.5-sonnet"
  - messages: array | string (required) — if array, coerced to canonical `LlmMessage[]`; if string with templates, resolved
  - temperature?: number|string (0..2)
  - maxTokens?: number|string (>=1)
  - timeout?: number|string (ms)
  - topP?: number|string (0..1)
  - frequencyPenalty?: number|string (-2..2)
  - presencePenalty?: number|string (-2..2)
  - tools?: ToolParams[] | string — enables function calling; sets `tools` and `tool_choice: 'auto'`, `parallel_tool_calls: false`
  - reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean }

Message normalization and conversion
- Input `messages` are coerced into canonical `LlmMessage[]`:
  - supports both `toolCalls` (camelCase) and `tool_calls` (snake_case)
  - tool arguments strings are parsed when possible; objects are preserved
- Sent to OpenRouter using OpenAI SDK `ChatCompletionCreateParamsStreaming`:
  - assistant toolCalls => assistant tool_calls (stringified arguments as required by API)
  - tool messages map `toolCallId` => `tool_call_id`

Streaming and events
- Uses the OpenAI SDK streaming client; chunks are normalized:
  - content tokens accumulated into a single `content` string
  - tool call fragments accumulated safely (balanced flush of JSON segments)
  - usage normalized from snake_case to camelCase (reasoningTokens preserved if provided)
- Events emitted (if `eventCallback` provided):
  - content_chunk: `{ chunk }` — normalized chunk with `choices[0].message.content` snapshot and synthesized `toolCalls` snapshot
  - content_complete: `{ model, usage: { cost, promptTokens, completionTokens, totalTokens } }`
  - tool_call_detected: when a tool call is first observed (id+name)

Return value (shape)
- Final `LLMResponse`:
```ts
{
  id, object: 'chat.completion', created, model,
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content,              // accumulated content string
      reasoning?,           // if provided by model
      toolCalls?: [         // [{ id?, type:'function', function: { name, arguments: object }}]
        { id?, type:'function', function: { name: string, arguments: object } }
      ]
    },
    finishReason
  }],
  usage                  // camelCase numeric fields and optional reasoningTokens
}
```

Validation rules (strict)
- model: required
- messages: array with at least 1 entry OR taken from upstream input (as user content) when omitted
- tools: must be an array of ToolParams or a template string; other types invalid
- Parameter ranges enforced:
  - temperature: 0..2
  - maxTokens: >= 1
  - topP: 0..1
  - frequencyPenalty, presencePenalty: -2..2
  - timeout: >= 1000ms is recommended at call-sites; the node validates minimums where applicable

Edge cases and guarantees
- When upstream input exists and `messages` is empty/missing, a single user message is synthesized from input (stringified for non-string).
- `parallel_tool_calls` is set to false to prevent multiple tool calls within a single assistant response.
- Provider-snapshot toolCalls are respected; arguments snapshot is used as a fallback if delta assembly yields shorter content.
- Errors are surfaced with descriptive messages; handler throws if API key is missing.

Example (chat with tools)

```ts
{
  ref: "llm",
  type: "llm",
  name: "AI",
  parameters: {
    model: "anthropic/claude-3.5-sonnet",
    messages: [{ role: "user", content: "Hello" }],
    temperature: 0.3,
    tools: [
      {
        name: "Calculator",
        slug: "calculator",
        description: "Add two numbers",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" }
          },
          required: ["a","b"]
        },
        blueprint: { nodes: [...], edges: [...] }
      }
    ]
  }
}
```

Cross-links
- See Tool for how tool schemas/blueprints are invoked.
- See Engine for event delivery and secureEnv handling.


