## Node: UIAction

What it is: A declarative “signal” node that emits a `ui_action` event to the host environment (server/UI/runner integration). The node itself is protocol-agnostic: it just emits an `action` string and optional `payload` object.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/UIAction.ts`
- Parameters:
  - `action: string` (required)
  - `payload?: object` (optional; must be a plain object)

Event emission
- On execute, the node emits an Autopilot event of type `ui_action`:

```ts
{
  type: "ui_action",
  timestamp: "2026-02-05T00:00:00.000Z",
  executionDepth: 0,
  data: {
    action: "some.action",
    payload: { /* optional */ }
  }
}
```

- Emission is **best-effort**: if the host callback throws, the workflow continues (the node does not fail the workflow).

Return value (node output)
- The node outputs a single item:

```ts
{ action: string, payload: Record<string, unknown> }
```

