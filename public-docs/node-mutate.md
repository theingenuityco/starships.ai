## Node: Mutate

What it is: State-only mutation node using reducer functions `(state, ctx) => nextState`. Does not transform the input item.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Mutate.ts`
- Parameters (resolved by Engine before dedicated Mutate; inline reducers are handled post-execution; stringEvaluationMode: full-only for guards):
  - reducers: ReducerSpec[] (required)
    - string: code only `(state, ctx) => newState`
    - object: `{ name?: string; if?: string; code: string; timeoutMs?: number }`

Reducer ctx (available keys)
- input: unwrapped input item
- $input(): same as input
- $lastOutputOf(ref): latest `ExecutionItem[]` for ref within current execution
- state: current execution.state (object)
- env(key), envAll(): access secureEnv from Engine
- JSON, Math, Date; console shim for log/error/warn
- Dangerous globals blocked: setTimeout, setInterval, require, process, global, eval, Function

Execution behavior
- Requires an execution context (provided by Engine).
- Reducers are normalized (strings to `{ code }`) and executed sequentially.
- Guard `if` (when provided) is evaluated via Eval (full-only); falsy => reducer skipped.
- Each reducer must return a full next state object; non-object results cause error.
- Snapshot/rollback: state snapshot is taken; on error, state is rolled back.
- Final validation ensures state is still an object.
- Returns `{ reducersApplied, names, changedKeys, timingsMs }` where `changedKeys` are shallow root-key diffs.

Timeouts
- Reducer execution timeout is currently enforced at ~1000ms per reducer.

Validation rules
- At least one reducer is required.
- For object spec:
  - `if` (when provided): template must pass Eval validation (full-only).
  - `code` must parse as a function expression; syntax errors are reported.

Example (append tool result)

```ts
{
  ref: "add-tool-result",
  type: "mutate",
  name: "Add Tool Result",
  parameters: {
    reducers: [
      `
      (state, ctx) => {
        const toolResult = ctx.$lastOutputOf("execute_tool")[0]?.json ?? {};
        const content = (typeof toolResult === 'string') ? toolResult : JSON.stringify(toolResult);
        const next = { ...(state || {}) };
        next.messages = [...(state?.messages ?? []), { role: 'tool', content }];
        return next;
      }
      `
    ]
  }
}
```

Cross-links
- See Transform for input->output transformations.
- See Engine for inline reducer ordering and template resolution of guards.


