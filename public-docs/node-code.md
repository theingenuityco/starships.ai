## Node: Code

What it is: Runs custom JavaScript safely via a constrained function wrapper. Requires `async function main(ctx)`.

> ⚠️ **REQUIRED:** All Code nodes must define an `async function main(ctx) { ... }` entrypoint.  
> The engine always calls `await main(ctx)`. Code that does not define this function **will not run**.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/Code.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - code: string (required) — must define `async function main(ctx) { ... }`
  - timeout?: number (ms; default 5000)

ctx surface (prefixed to avoid collisions)

- input: unwrapped input item (`ctx.input`)
- state: execution.state (`ctx.state`)
- env(key): host-provided env lookup (in Starships, only `ctx.env('STARSHIP_ID')` is populated; custom env keys are not supported)
- lastOutputOf(ref): latest output json for ref within current execution (`ctx.lastOutputOf(ref)`)
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
        const data = ctx.input || {};
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

### Accessing initial tool/workflow arguments

Use this table to decide how to read arguments and intermediate data:

| Your node position            | Access pattern                      | Typical use case                              |
|------------------------------|-------------------------------------|-----------------------------------------------|
| Directly after `start`       | `ctx.input`                         | First node to process tool/workflow arguments |
| Anywhere (need original args)| `ctx.lastOutputOf('__initial__')`   | Node far from `start` but needs raw args      |
| After any upstream node      | `ctx.input`                         | Work with the previous node’s output          |

Notes:

- `__initial__` is a synthetic ref that always points to the original tool/workflow input.
- Do **not** use `ctx.state` for initial arguments unless you explicitly copied them there via a Mutate node.

### When to use Code vs Transform

- **Use Transform** when:
  - You are doing simple field mapping or reshaping JSON.
  - JSON Patch operations (`add`, `replace`, `remove`, `copy`, `move`, `test`) are sufficient.
  - You can express logic as “take `input`, apply a few patches, return the result”.
- **Use Code** when:
  - You need branching, loops, or more complex control flow.
  - You need to call `ctx.lastOutputOf()` for multiple nodes and combine their data.
  - You want to encapsulate non-trivial logic in JavaScript rather than long template expressions.

You can often start with Transform for simple reshaping, and graduate to a Code node when the number or complexity of transforms becomes hard to read.
