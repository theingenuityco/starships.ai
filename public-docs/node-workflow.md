## Node: Workflow

What it is: Executes an embedded blueprint as a nested workflow and returns its final output.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Workflow.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - name: string (required)
  - description?: string
  - timeout?: number
  - blueprint: Blueprint (required)
  - metadata?: Record<string, unknown>

Execution behavior
- Creates a child execution using the parent as base (preserves depth, visit counts lineage).
- Uses a depth-aware Runner chosen by RunnerFactory.
- `failOnNodeError: true` for nested workflow.
- Returns the nested blueprint’s output items.

Validation rules
- blueprint must exist and be an object with:
  - nodes: array
  - edges: array
  - at least one `start` node
- Edge references are validated: `from` and `to` must exist as node refs.

Use cases
- Encapsulate reusable subflows (e.g., sanitize input, complex pre/post-processing).
- Provide a composable building block for larger graphs.

Example (summarize)

```ts
{
  ref: "subflow",
  type: "workflow",
  name: "Summarize",
  parameters: {
    blueprint: {
      nodes: [
        { ref: "s", type: "start", name: "Start", parameters: {} },
        { ref: "llm", type: "llm", name: "Summarize", parameters: {
            model: "anthropic/claude-3.5-sonnet",
            messages: [ { role: "user", content: "Summarize this: {{ $input() }}" } ]
        } },
        { ref: "e", type: "end", name: "End", parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' } }
      ],
      edges: [
        { ref: "e1", from: "s", to: "llm" },
        { ref: "e2", from: "llm", to: "e" }
      ]
    }
  }
}
```

Cross-links
- See Engine for parameter resolution and inline operations.
- See Start/End for input and final result conventions.


