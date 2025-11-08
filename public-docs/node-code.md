## Node: Code

What it is: Runs custom JavaScript safely via a constrained function wrapper. Requires `async function main(ctx)`.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/Code.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - code: string (required) — must define `async function main(ctx) { ... }`
  - timeout?: number (ms; default 5000)

ctx surface (prefixed to avoid collisions)

- $input: unwrapped input item
- $state: execution.state
- $env(key): secure env lookup
- $lastOutputOf(ref): latest `ExecutionItem[]` for ref within current execution
- console shim: log/error/warn (scoped)

Security model

- Blocked globals via parameter shadowing: setTimeout, setInterval, require, Function, process, global, globalThis
- JSON, Math, Date remain available through JS built-ins

Execution behavior

- The source is wrapped and executed via `new Function(...)` with strict mode and the above shims.
- `main(ctx)` return value is awaited if Promise-like; otherwise returned directly.
- Non-finite numbers (Infinity, -Infinity, NaN) are replaced with sentinel strings to ensure JSON-safe outputs.
- Errors are wrapped with helpful context: "Code execution failed".

Validation rules

- `code` required and must compile.
- Regex check enforces presence of `async function main(` entrypoint.
- timeout (if provided) must be >= 100ms.

Example (prepare args)

```ts
{
  ref: "prep-args",
  type: "code",
  name: "Prepare Args",
  parameters: {
    code: `
      async function main(ctx) {
        const data = ctx.$input || {};
        return { message: String(data?.message ?? "hello") };
      }
    `,
    timeout: 3000
  }
}
```

Cross-links

- See Tool for argument expectations (object-only).
- See Engine for template resolution rules (applied to parameters before handler execution).
