## Example 08 — Error handling modes (fail-fast vs resilient)

Goal: Demonstrate Engine `failOnNodeError` behavior.

Scenario: HTTP 404 triggers an error.

Code (fail-fast, default)

```ts
import { Engine, ExecutionItemUtils, type HostRuntime } from '@starships/autopilot';

const hostRuntime: HostRuntime = {
  http: async ({ method, url, headers = {}, body, timeoutMs }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const finalMethod = String(method || 'GET').toUpperCase();
      const init: RequestInit = { method: finalMethod, headers: headers as any, signal: controller.signal };
      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        const h = new Headers(init.headers as any);
        if (typeof body !== 'string' && !h.has('content-type')) h.set('content-type', 'application/json');
        init.headers = h;
      }
      const resp = await fetch(url, init);
      const contentType = resp.headers.get('content-type') || '';
      const respBody = contentType.includes('application/json') ? await resp.json().catch(() => resp.text()) : await resp.text();
      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => (responseHeaders[k] = v));
      return { status: resp.status, statusText: resp.statusText, headers: responseHeaders, body: respBody, url: resp.url };
    } finally {
      clearTimeout(t);
    }
  },
  connectorAction: async () => {
    throw new Error('HostRuntime.connectorAction not configured for this example');
  },
};

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

const engine = new Engine({ hostRuntime }); // failOnNodeError === true
const exec = ExecutionItemUtils.createExecution();
await engine.executeBlueprint(blueprint, exec); // throws Error("HTTP request failed: ... -> 404 ...")
```

Code (resilient mode)

```ts
// Using the same `blueprint` and `hostRuntime` from the previous snippet:
const engine = new Engine({ failOnNodeError: false, hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// Execution continues; 'http' node result contains an error item; workflow completes returning accumulated results
```

