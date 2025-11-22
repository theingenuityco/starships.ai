## Node: Conditional

What it is: Branching node that computes a condition value and exposes `edgeCondition` to drive edge selection.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Conditional.ts`
- Parameters:
  - condition?: string | any
    - If string, may include `{{ ... }}` templates.
    - If non-string (including null/undefined), treated as already-resolved value.

Evaluation rules
- If condition is string and contains templates, Eval resolves it with access to:
  - state, outputs, status, currentNodeRef, input
  - helpers: `$lastOutputOf(nodeRef)`, `$input(path?)`, `$exists(value)`, `env('STARSHIP_ID')` (Starships host only; no other env keys exposed)
- Result mapping → `edgeCondition`:
  - null/undefined => `edgeCondition` omitted
  - boolean => `'true'` or `'false'`
  - object with `{ match, ... }` legacy regex shape => uses `match` string
  - other values => `String(result)`

Return value (shape)
- `{ result, edgeCondition? }` as a single `ExecutionItem`

Edge routing (Engine behavior)
- Engine scans inline condition outputs after the node’s primary output; if none found, it inspects the node’s primary output for `edgeCondition`.
- It then matches the outgoing edge where `edge.condition` equals the computed `edgeCondition`. Fallback preference: explicit `'false'`, then no-condition edge.

Validation rules
- `condition` must exist (presence) even if it resolves to undefined.
- Empty string is invalid.
- If string with templates: templates must pass Eval validation.

Example (tool-call routing)

```ts
{
  ref: "check",
  type: "conditional",
  name: "Check Tool Calls",
  parameters: {
    condition: '{{ (() => { const last=$input(); const fr=last?.choices?.[0]?.finishReason; if(fr==="length") return "continue"; const calls=last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls)&&calls.length>0 ? "call_tool" : "complete"; })() }}'
  }
}
```

Cross-links
- See LLM for details of `finishReason` and `toolCalls`.
- See Engine for edge selection algorithm and inline condition handling.


