# Tool calling in Autopilot

Autopilot supports function calling (“tools”) by combining:

- **LLM node**: exposes tool schemas to the model (via the host runtime)
- **ToolParams**: the tool definition shape (name/slug/schema + a blueprint)
- **Tool node**: executes a tool by running its nested blueprint with object arguments
- **Agent node** (optional): orchestrates a tool loop around the LLM

## ToolParams (the canonical tool definition)

`ToolParams` is defined in `packages/autopilot/src/types/node-parameters.ts`:

- **name**: human-friendly display name (required)
- **slug**: stable function name presented to LLMs (required)
- **description**: tool description (required)
- **parameters**: JSON Schema (required; `type: "object"` and `properties`)
- **blueprint**: nested blueprint executed by the Tool node (required; must include a `start` node)
- **toolCallId**: optional correlation id for tool call events/results

## HostRuntime requirement (LLM)

The `llm` node requires a host-provided `hostRuntime.llm`. Autopilot does **not** store API keys, and the `autopilot` singleton is **not** a credentials manager.

Your host runtime is responsible for:

- Selecting a provider (OpenRouter/OpenAI/Anthropic/etc.)
- Providing credentials (env/secret store/OAuth)
- Converting `ToolParams[]` into provider-native tool definitions (use `tool.slug` as the function name when present)

See `@starships/autopilot-runner`’s `RunnerHostRuntime` for a working OpenRouter/OpenAI-compatible implementation.

## How tool execution works (local Tool node pattern)

1. **LLM** returns `toolCalls[].function.arguments` as a JSON string (provider format).
2. A **Code** node materializes those arguments into a **plain object**.
3. The **Tool** node executes the tool’s `blueprint` using that object as the tool input.

Important: the Tool node is strict about arguments:

- `null`/`undefined`/empty string → `{}`  
- plain object → passthrough  
- anything else (including non-empty strings) → error

## Example: calculator tool definition

```ts
const calculatorTool = {
  name: 'Calculator',
  slug: 'calculator',
  description: 'Add two numbers',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'First number' },
      b: { type: 'number', description: 'Second number' },
    },
    required: ['a', 'b'],
  },
  blueprint: {
    nodes: [
      { ref: 's', type: 'start', name: 'Start', parameters: {} },
      {
        ref: 'add',
        type: 'code',
        name: 'Add',
        parameters: {
          code: `
            async function main(ctx) {
              const { a, b } = ctx.input || {};
              return { sum: Number(a) + Number(b) };
            }
          `,
        },
      },
      { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("add") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 's', to: 'add' },
      { ref: 'e2', from: 'add', to: 'e' },
    ],
  },
};
```

## Agent node note (Starships-hosted vs local tools)

Autopilot ships an `Agent` node with a default blueprint. In the Starships hosted product, that default blueprint delegates tool authorization/execution to the server via a `connector_action` call (so the host can enforce allow/ask/deny policies and keep secrets out of blueprints).

Even in that mode, tools are still represented as `ToolParams` and must include a `blueprint` (it’s used as part of the allowlist check in the default blueprint).

## Code node requirement (inside tools)

When authoring `code` nodes inside tool blueprints, you must define:

```js
async function main(ctx) {
  return { ok: true };
}
```

Top-level `return ...` is not supported; the engine always calls `await main(ctx)`.


