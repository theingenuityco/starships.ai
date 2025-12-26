## Node: LLM

What it is: Streams model outputs via OpenRouter (OpenAI-compatible API) with reliable accumulation and function calling. Normalizes message/tool formats and usage accounting.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/LLM.ts`
- Requires `hostRuntime.llm` (provided by the embedding host). Credentials/API keys are owned by the host and are never exposed to workflows.
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - model: string (required) — e.g., "anthropic/claude-3.5-sonnet"
  - messages: array (required; non-empty)
    - If you need to compute messages dynamically, use a full-string template that resolves to an array (e.g. `messages: "{{ state.messages }}"`).
    - A literal string is not accepted by validation unless it resolves (via templates) to an array.
  - stream?: boolean|string — when false, the host runtime must return a non-stream request wrapped as an AsyncIterable (see HostRuntime notes)
  - temperature?: number|string (0..2)
  - maxTokens?: number|string (>=1)
  - timeout?: number|string (ms)
  - topP?: number|string (0..1)
  - frequencyPenalty?: number|string (-2..2)
  - presencePenalty?: number|string (-2..2)
  - tools?: ToolParams[] | string — enables function calling; the host runtime converts these ToolParams into provider-native tool definitions (OpenAI/OpenRouter function tools)
  - reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean }
  - modalities?: ('text'|'image')[] | string
  - imageConfig?: Record<string, unknown> | string

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
- messages: array with at least 1 entry (must be explicitly provided or resolve to a non-empty array)
- tools: must be an array of ToolParams or a template string; other types invalid
- Parameter ranges enforced:
  - temperature: 0..2
  - maxTokens: >= 1
  - topP: 0..1
  - frequencyPenalty, presencePenalty: -2..2
  - timeout: >= 1000ms is recommended at call-sites; the node validates minimums where applicable

Edge cases and guarantees

- Tool naming: for OpenAI/OpenRouter function calling, the host runtime should use `tool.slug` as the function name when present (falling back to `tool.name` if slug is missing).
- Provider-snapshot toolCalls are respected; arguments snapshot is used as a fallback if delta assembly yields shorter content.
- Errors are surfaced with descriptive messages; missing credentials should be detected/raised by the host runtime (not by the blueprint).

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
- See Engine for event delivery and runtime configuration handling.
