## Node: Tool

What it is: Deterministic function-call node that executes a nested blueprint with validated arguments and returns its result. Used by LLM function calling (via the LLM node) and for reusable subroutines.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/Tool.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - name: string (required)
  - slug: string (required) — function name presented to LLMs (kebab/snake preferred)
  - description: string (required)
  - parameters: object (required) — JSON Schema subset
    - type: "object" (required)
    - properties: Record<string, ToolParameterSchema> (required)
    - required?: string[]
    - root-level combinators supported: allOf, anyOf, oneOf, not, if/then/else
  - blueprint: Blueprint (required) — must include a `start` node
  - toolCallId: string (optional) — associates result to originating assistant tool_call id

Argument extraction (strict)

- Unwrapped upstream input is interpreted as the function arguments:
  - input == null or input == "" (empty string) => {}
  - input is a plain object (non-array) => passthrough
  - any other input => error: "Tool arguments must be provided as a plain object input."
- Tool does not parse strings; upstream should materialize objects (e.g., via a Code node).

Execution lifecycle

1. Engine resolves handler parameters (inline transforms/reducers/condition are handled separately post-execution by Engine).
2. Tool unwraps input to arguments per rules above.
3. Tool creates a child execution inheriting parent depth and sets arguments as initial input (`__initial__`).
4. Runner is depth-aware; events are emitted at the parent depth.
5. Nested blueprint is executed with `failOnNodeError: true`. Tool returns the unwrapped final result.

Return value (shape)

- Success: single `ExecutionItem` whose `json` equals the nested blueprint’s final output.
- Error: single `ExecutionItem` with
  - json: `{ ok: false, error, details: { name, message, stack?, cause?, nodeRef?, depth, runner, toolName, toolCallId, timestamp } }`
  - error: same message string.

Events (emitted)

- tool_started: { toolName, arguments, toolCallId }
- tool_complete success: { toolName, arguments, result, toolCallId }
- tool_complete error: { toolName, toolCallId, error, result: { ok: false, error, details } }

Validation (before execution)

- name, description: required, non-empty.
- parameters: must exist with `type: 'object'` and `properties` object.
- blueprint: must exist and contain a start node.

Edge cases and guarantees

- Determinism (modulo external effects).
- Depth/runner: respects parent-child nesting for isolation.

Example (calculator)

```ts
{
  ref: "do-math",
  type: "tool",
  name: "Calculator",
  parameters: {
    name: "Calculator",
    slug: "calculator",
    description: "Add two numbers",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" }
      },
      required: ["a","b"]
    },
    blueprint: {
      nodes: [
        { ref: "s", type: "start", name: "Start", parameters: {} },
        { ref: "code", type: "code", name: "Add", parameters: {
          code: `
            async function main(ctx) {
              const { a, b } = ctx.$input || {};
              return { sum: Number(a) + Number(b) };
            }
          `
        }},
        { ref: "e", type: "end", name: "End", parameters: { output: '{{ $lastOutputOf("code")?.[0]?.json }}' } }
      ],
      edges: [
        { ref: "e1", from: "s", to: "code" },
        { ref: "e2", from: "code", to: "e" }
      ]
    }
  }
}
```

Cross-links

- See LLM: function-calling integration (`tools`, `toolCalls`).
- See Engine: parameter template resolution and inline operations.
