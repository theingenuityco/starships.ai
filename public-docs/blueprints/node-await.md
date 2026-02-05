## Node: Await

What it is: A dedicated node that requests the host to **wait for an external event** and **pauses** the workflow until the server resumes it.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Await.ts`
- Engine integration: `packages/autopilot/src/engine/Engine.ts`
- Parameters:

```ts
{
  kind: "connector_event",
  spec: {
    provider?: string,
    connectorId?: string,
    eventTypes?: string[],
  }
}
```

### Runtime behavior

When executed, the node:
- Emits an Autopilot event of type `await_requested` with:
  - `nodeRef` (the node’s `ref`)
  - `kind`
  - `spec`
- Pauses the execution (`execution.status = "paused"`). The Engine emits `workflow_paused` and returns.

### Resume contract (server)

The server persists the paused `execution` snapshot in `autopilot_awaits.execution_json`. When a matching connector event arrives, the server resumes by:
- Loading the persisted execution snapshot
- Replacing the await node’s recorded output (by `nodeRef`) with the connector event envelope
- Continuing execution from `execution.currentNodeRef` (the Engine sets this to the next node when pausing)

This means the **next node after the await** receives the connector event envelope as its input.

### Where connector events come from (server)

For `kind: "connector_event"`, the server creates normalized connector events by ingesting inbound connector webhooks.

Important notes:

- Webhook ingress is **global** (no starship id in the URL): `POST /api/v1/webhooks/connectors/:provider`
- Routing is derived from the inbound request using connector template `webhooksJson` (`connector_templates.webhooks_json`)
- The normalized event envelope injected on resume includes fields like `provider`, `eventType`, `payloadJson`, and timestamps

See `../connectors/webhooks.md` for the template config reference.

### Matching semantics

The matcher is intentionally permissive:
- Missing `provider` / `connectorId` / `eventTypes` means wildcard.
- If `eventTypes` is provided, the inbound `eventType` must be one of those strings.

