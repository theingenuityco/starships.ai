## Node: Transform

What it is: Input->output transformer using JSON Patch semantics. Never mutates execution.state. Requires input data.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Transform.ts`
- Parameters (resolved by Engine before execution for dedicated Transform node; inline transforms are resolved post-execution; both use stringEvaluationMode: full-only):
  - transforms: TransformOperation[] (required)
    - operation: 'add' | 'replace' | 'remove' | 'copy' | 'move' | 'test'
    - path: string (JSON Pointer)
    - value?: any (templates allowed)
    - from?: string (templates allowed; required for copy/move)

Template resolution context for values
- For dedicated Transform node: parameters resolved with execution context and current input unwrapped.
- For inline transforms (on other nodes): Engine executes them after the handler on the handler’s output, resolving templates with that output as `input`.

Execution behavior
- Requires non-empty input `ExecutionItem[]`; otherwise throws with guidance to use Mutate for state changes.
- Applies operations sequentially; each operation sees the result of prior operations.
- Uses `fast-json-patch` applyPatch on the input value.
- Returns the transformed value as a single `ExecutionItem` paired with the original input item.

Validation rules
- At least one transform is required.
- operation must be valid.
- path must be a non-empty string (no `/state` prefix requirement since this is not state).
- add/replace/test require `value`.
- copy/move require `from`.
- Template expressions in `value` and `from` are validated via Eval’s template validator.

Example (reshape)

```ts
{
  ref: "reshape",
  type: "transform",
  name: "Pick fields",
  parameters: {
    transforms: [
      { operation: "add", path: "/title", value: '{{ input?.body?.title }}' },
      { operation: "remove", path: "/debug" }
    ]
  }
}
```

Cross-links
- See Mutate for state mutations via reducers.
- See Engine for inline transforms ordering relative to handler execution.


