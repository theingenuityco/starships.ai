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

### Await/resume contract used by headless automation

Our server-side automation workers treat a specific UIAction as a durable “await” request.

- **Action string**: `await.connector_event`
- **Payload**: an `AutopilotAwaitSpec` object (plain JSON) used for DB matching.

#### `AutopilotAwaitSpec` payload schema

All fields are optional; omitted fields mean “match all”.

```ts
import type { AutopilotAwaitSpec } from '@starships/protocol';

const spec: AutopilotAwaitSpec = {
  provider: 'slack',
  connectorId: 'conn_123',
  eventTypes: ['message.created'],
};
```

Matching semantics (DB)
- Implemented in `AutopilotAwaitRepository.findWaitingMatches()`.
- **Permissive** by design:
  - Missing `provider` / `connectorId` / `eventTypes` means wildcard.
  - `eventTypes` matches if it contains the inbound `eventType`.

Resume input contract (what your blueprint receives)
- When a matching connector event arrives, the resume worker re-runs your blueprint with:
  - `execution.state` preloaded from the saved `stateJson`
  - `__initial__` input set to a **connector event envelope**:

```ts
import type { ConnectorEventModel } from '@starships/protocol';

type ResumeConnectorEvent = Pick<
  ConnectorEventModel,
  'id' | 'starshipId' | 'connectorId' | 'provider' | 'eventType' | 'externalEventId' | 'receivedAt' | 'payloadJson'
>;
```

State persistence note
- The automation workers checkpoint `execution.state` using `extractPersistableState()`, which excludes ephemeral keys like `messages`, `tools`, `plugins`, and LLM runtime overrides.
- If you want something to survive across awaits, store it in `execution.state` under your own keys (JSON-serializable).

