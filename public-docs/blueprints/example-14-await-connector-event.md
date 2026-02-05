## Example 14 — Await and resume from a connector event (headless automation)

Goal: Use `ui_action` to checkpoint workflow state, “exit”, then resume later when a connector webhook event arrives.

This example is designed to work with the server automation workers:
- `packages/server/src/workers/autopilotAutomationWorker.ts`
- `packages/server/src/workers/autopilotAutomationResumeWorker.ts`

### Key idea

- To **arm** an await, emit:
  - `ui_action.action = "await.connector_event"`
  - `ui_action.payload = { provider?, connectorId?, eventTypes? }`
- The worker persists an `autopilot_awaits` row with your blueprint + a filtered snapshot of `execution.state`.
- Later, when a matching connector event is ingested, the resume worker re-runs the blueprint:
  - `execution.state` is restored from the saved snapshot
  - the Start node receives `__initial__` input = connector event envelope

### Blueprint (arm → await; resume → handle event → optionally re-arm)

```ts
import type { Blueprint } from '@starships/autopilot';
import type { AutopilotAwaitSpec, ConnectorEventModel } from '@starships/protocol';

type ResumeConnectorEvent = Pick<
  ConnectorEventModel,
  'id' | 'starshipId' | 'connectorId' | 'provider' | 'eventType' | 'externalEventId' | 'receivedAt' | 'payloadJson'
>;

const awaitSpec: AutopilotAwaitSpec = {
  // Wildcards are allowed: omit any field to match all.
  provider: '{{ env("CONNECTOR_PROVIDER") }}',
  eventTypes: ['message.created', 'issue.opened'],
};

const blueprint: Blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },

    // Decide whether this run is the initial "arm" run or a resume run.
    {
      ref: 'mode',
      type: 'conditional',
      name: 'Mode',
      parameters: {
        condition:
          '{{ (() => { const evt=input; return evt && evt.eventType ? "resume" : "arm"; })() }}',
      },
    },

    // Arm path: prepare state and ask the host to await a connector event.
    {
      ref: 'arm_state',
      type: 'mutate',
      name: 'Set state (armed)',
      parameters: {
        mutations: [
          { op: 'set', path: 'automation', value: { armedAt: '{{ new Date().toISOString() }}' } },
        ],
      },
    },
    {
      ref: 'await_evt',
      type: 'ui_action',
      name: 'Await connector event',
      parameters: {
        action: 'await.connector_event',
        payload: awaitSpec,
      },
    },

    // Resume path: process the inbound event (from Start input) and re-arm.
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
              // On resume runs, Start input is a ResumeConnectorEvent envelope.
              eventType: '{{ input.eventType }}',
              provider: '{{ input.provider }}',
              receivedAt: '{{ input.receivedAt }}',
              payloadJson: '{{ input.payloadJson }}',
            },
          },
        ],
      },
    },
    {
      ref: 'rearm',
      type: 'ui_action',
      name: 'Re-arm (optional)',
      parameters: {
        action: 'await.connector_event',
        payload: {
          provider: '{{ input.provider }}',
          // Example: re-arm for exactly the same eventType.
          eventTypes: ['{{ input.eventType }}'],
        },
      },
    },

    { ref: 'e', type: 'end', name: 'End', parameters: {} },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'mode' },

    { ref: 'e_arm', from: 'mode', to: 'arm_state', condition: 'arm' },
    { ref: 'e_arm2', from: 'arm_state', to: 'await_evt' },
    { ref: 'e_arm3', from: 'await_evt', to: 'e' },

    { ref: 'e_res', from: 'mode', to: 'handle', condition: 'resume' },
    { ref: 'e_res2', from: 'handle', to: 'rearm' },
    { ref: 'e_res3', from: 'rearm', to: 'e' },
  ],
};
```

Notes
- The automation worker interprets the presence of the await `ui_action` as “create an await record after the run completes”. For predictable behavior, keep the await branch **short** (typically `ui_action` → `end`).
- On resume runs, emitting another await `ui_action` makes the workflow **recurring**: the resume worker creates a new await and completes the current await/firing.

