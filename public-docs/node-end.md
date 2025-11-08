## Node: End

What it is: Terminal node that finalizes a workflow and optionally emits a final result value.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/End.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - output?: any — may include `{{ ... }}` templates resolved by Engine

Execution behavior

- If `output` is present, End returns a single item `{ result: output }`.
- Otherwise End returns `{}`.
- Engine inspects the End node’s output at completion time and, when `{ result }` exists, unwraps it to become the workflow’s final return value.

Validation

- Always valid.

Use cases

- Emit final structured data from a workflow or tool.
- Project the last node’s JSON to a simpler result.

Example

```ts
{
  ref: "end",
  type: "end",
  name: "Done",
  parameters: { output: '{{ $lastOutputOf("llm")?.[0]?.json }}' }
}
```
