## Example 14 — Await and resume from a connector event (headless automation)

Goal: Use the dedicated `await` node to pause workflow execution, then resume later when a connector webhook event arrives.

This example is designed to work with the server automation workers:

- `packages/server/src/workers/autopilotAutomationWorker.ts`
- `packages/server/src/workers/autopilotAutomationResumeWorker.ts`

### Key idea

- To **arm** an await, execute an `await` node:
  - `type: "await"`
  - `parameters.kind = "connector_event"`
  - `parameters.spec = { provider?, connectorId?, eventTypes? }`
- The server persists an `autopilot_awaits` row including a paused `execution_json` snapshot.
- Later, when a matching connector event is ingested, the server resumes by injecting the connector event envelope as the **await node’s output**, so the **next node after the await** receives it as its input.

### Blueprint (arm → await → handle → end)

```ts
import type { Blueprint } from '@starships/autopilot';

const blueprint: Blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },

    // Prepare state and wait for a connector event.
    {
      ref: 'arm_state',
      type: 'mutate',
      name: 'Set state (armed)',
      parameters: {
        mutations: [{ op: 'set', path: 'automation', value: { armedAt: '{{ new Date().toISOString() }}' } }],
      },
    },
    {
      ref: 'await_evt',
      type: 'await',
      name: 'Await connector event',
      parameters: {
        kind: 'connector_event',
        spec: {
          // Wildcards are allowed: omit any field to match all.
          provider: '{{ env("CONNECTOR_PROVIDER") }}',
          eventTypes: ['message.created', 'issue.opened'],
        },
      },
    },

    // On resume, this node receives the connector event envelope as its input.
    {
      ref: 'handle',
      type: 'transform',
      name: 'Handle event',
      parameters: {
        transforms: [
          {
            op: 'set',
            path: 'lastEvent',
            value: {
              eventType: '{{ input.eventType }}',
              provider: '{{ input.provider }}',
              receivedAt: '{{ input.receivedAt }}',
              payloadJson: '{{ input.payloadJson }}',
            },
          },
        ],
      },
    },

    { ref: 'e', type: 'end', name: 'End', parameters: {} },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'arm_state' },
    { ref: 'e2', from: 'arm_state', to: 'await_evt' },
    { ref: 'e3', from: 'await_evt', to: 'handle' },
    { ref: 'e4', from: 'handle', to: 'e' },
  ],
};
```

Notes

- For predictable behavior, keep the portion of the graph **between awaits** small and explicit.
- To make an automation recurring, add another `await` node after handling the event (the resume worker will persist the new paused execution as a new await and complete the previous await/firing).
