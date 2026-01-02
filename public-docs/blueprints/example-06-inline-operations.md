## Example 06 — Inline operations (transforms, reducers, condition)

Goal: Use inline transforms/reducers/condition on a non-dedicated node. Engine runs them post-handler in that order.

Code

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
    {
      ref: 'http',
      type: 'http_request',
      name: 'Fetch',
      parameters: {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        transforms: [
          // Inline: runs AFTER http handler; input is http node output
          { operation: 'add', path: '/title', value: '{{ input?.body?.title }}' },
        ],
        reducers: [
          `
          (state, ctx) => {
            const next = { ...(state || {}) };
            next.meta = { fetchedAt: new Date().toISOString() };
            return next;
          }
          `,
        ],
        condition: '{{ exists(input?.body?.id) ? "ok" : "missing" }}',
      },
    },
    { ref: 'ok', type: 'end', name: 'OK', parameters: { output: 'ok' } },
    { ref: 'missing', type: 'end', name: 'Missing', parameters: { output: 'missing' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'ok', condition: 'ok' },
    { ref: 'e3', from: 'http', to: 'missing', condition: 'missing' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
```

