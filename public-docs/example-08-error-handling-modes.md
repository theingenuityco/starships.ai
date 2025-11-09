## Example 08 — Error handling modes (fail-fast vs resilient)

Goal: Demonstrate Engine `failOnNodeError` behavior.

Scenario: HTTP 404 triggers an error.

Code (fail-fast, default)

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    { ref: 'http', type: 'http_request', name: 'Fetch', parameters: { url: 'https://httpbin.org/status/404', method: 'GET' } },
    { ref: 'e', type: 'end', name: 'End', parameters: {} },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'e' },
  ],
};

const engine = new Engine(); // failOnNodeError === true
const exec = ExecutionItemUtils.createExecution();
await engine.executeBlueprint(blueprint, exec); // throws Error("HTTP request failed: ... -> 404 ...")
```

Code (resilient mode)

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const engine = new Engine({ failOnNodeError: false });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// Execution continues; 'http' node result contains an error item; workflow completes returning accumulated results
```

