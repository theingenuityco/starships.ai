## Node: Start

What it is: Entry point for a workflow or tool blueprint. Produces a default input item or passes through the initial item.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Start.ts`
- Parameters: none (extra keys ignored).

Execution behavior
- If Engine provided an initial input (`__initial__`) to the workflow/tool, it is passed through unchanged.
- Otherwise, Start returns a single item with `{}`.
- Start never modifies `execution.state`.

Validation
- Always valid.

Use cases
- Initialize a workflow or tool blueprint.
- Provide deterministic behavior when no previous node exists.

Example

```ts
{ ref: "start", type: "start", name: "Begin", parameters: {} }
```


