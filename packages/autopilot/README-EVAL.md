# Template Expressions (Eval)

Autopilot supports JavaScript template expressions embedded in strings using:

`{{ /* JS expression */ }}`

These templates are resolved by the Engine via `Eval` before (and sometimes after) a node handler runs.

## Key rule: full-string templates (Engine default)

When the Engine resolves handler parameters it uses **full-only** evaluation: a string is evaluated **only if the entire string is exactly one template**.

✅ Valid:

```ts
{
  output: '{{ lastOutputOf("llm") }}';
}
{
  url: '{{ "https://example.com?q=" + encodeURIComponent(input.q) }}';
}
{
  content: '{{ `Hello ${input.name}` }}';
}
```

❌ Not evaluated (returned literally in handler parameters):

```ts
{
  content: 'Hello {{ input.name }}!';
}
{
  url: 'https://example.com?q={{ input.q }}';
}
```

If you need string interpolation, use a single template that returns the final string (e.g. a template literal) as shown above.

## What’s available inside templates

Templates evaluate with an `EvalContext` (see `packages/autopilot/src/engine/Eval.ts`):

- **`input`**: the current evaluation input (unwrapped)
- **`state`**: execution state object
- **`outputs`**: ordered history of node outputs (`{ nodeRef, items[] }[]`)
- **`status`**: `'running' | 'completed' | 'failed' | 'paused'`
- **`currentNodeRef`**: the node currently executing
- **Helpers**
  - **`lastOutputOf(nodeRef)`**: latest output json for a nodeRef
- 0 items → `undefined`
- 1 item → `item.json`
  - N items → `item.json[]`
  - **`exists(value)`**: `value !== null && value !== undefined`
  - **`env(key)`**: non-secret runtime env lookup (from `Engine({ runtimeEnv })`)

## Runtime env (non-secret only)

- The host can pass **non-secret** values via `new Engine({ runtimeEnv: { ... } })`.
- Templates can read those values via `env('KEY')`.
- Code/Mutate can read them via `ctx.env('KEY')`.

**Do not put secrets in `runtimeEnv`**. Secrets should live in the host runtime (e.g. `hostRuntime.llm`, `hostRuntime.http`, connector drivers).

## Blueprint-safe evaluation (nested scopes)

Eval intentionally avoids resolving templates inside nested blueprint definitions so those templates can resolve later in their own execution scope:

- Any object that looks like a Blueprint (`{ nodes: [], edges: [] }`) is treated as opaque.
- Any `blueprint` key whose value is blueprint-like is treated as opaque.
- Any `tools` array where each tool contains a blueprint-like `blueprint` is treated as opaque.

This prevents “cross-scope” evaluation when you embed tools/workflows inside other tools/workflows.

## Common patterns

### Conditional routing

```ts
{
  type: 'conditional',
  ref: 'cond',
  name: 'Route',
        parameters: {
    condition: '{{ exists(lastOutputOf("http")?.error) ? "retry" : "ok" }}',
  },
}
```

### HttpRequest URL building (recommended)

Because handler parameters are full-only, build complex URLs in a Code node and pass them downstream:

```ts
{
  ref: 'build_url',
  type: 'code',
  name: 'Build URL',
  parameters: {
    code: `
      async function main(ctx) {
        const q = String(ctx.input?.q ?? "hello");
        return { url: "https://example.com/search?q=" + encodeURIComponent(q) };
      }
    `,
  },
}
```

```ts
{
  ref: 'http',
  type: 'http_request',
  name: 'HTTP',
  parameters: {
    method: 'GET',
    url: "{{ (lastOutputOf('build_url') || {}).url }}",
  },
}
```

## Validation and security

- `Eval.validateExpression(expr)` performs a compile-time syntax check.
- `Eval.validateTemplateExpressions(value)` validates all `{{ ... }}` occurrences found within a value.

Security note: Eval uses `new Function('ctx', 'with (ctx) { ... }')`. This is **not a hardened sandbox**. If you execute untrusted blueprints, run Autopilot inside an isolate (child process / container / VM) or replace Eval with a hardened evaluator.
