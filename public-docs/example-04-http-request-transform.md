## Example 04 — HTTP request followed by Transform

Goal: Call an external API and reshape the response before returning it.

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
      const init = { method: finalMethod, headers, signal: controller.signal };
      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        const h = new Headers(init.headers);
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
      name: 'Fetch Post',
      parameters: {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        timeout: 10000,
      },
    },
    {
      ref: 'shape',
      type: 'transform',
      name: 'Pick fields',
      parameters: {
        transforms: [
          { operation: 'add', path: '/id', value: '{{ input?.body?.id }}' },
          { operation: 'add', path: '/title', value: '{{ input?.body?.title }}' },
          { operation: 'remove', path: '/debug' },
        ],
      },
    },
    { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("shape") }}' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'http' },
    { ref: 'e2', from: 'http', to: 'shape' },
    { ref: 'e3', from: 'shape', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
const exec = ExecutionItemUtils.createExecution();
const out = await engine.executeBlueprint(blueprint, exec);
// out[0].json → { id, title }
```

