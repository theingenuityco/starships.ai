## Example 13 — Binary download → binary upload (in-flight)

Goal: Download bytes from one URL and upload the same bytes to another URL **without putting the bytes in the blueprint JSON**.

This relies on:

- `http_request` with `responseType: "arrayBuffer"` to store bytes into `ExecutionItem.binary`
- A second `http_request` with `bodyFromBinaryKey` to upload those bytes as a raw body
- The Engine keeping binary **in-flight only** (bytes are stripped from `execution.results` / events to stay JSON-safe)

Note: this pattern uses binary request/response bodies. If you need web-unlocking for public sites, use the reserved `system` connector actions via `connector_action` (those flows may have their own limitations depending on backend).

Code

```ts
import { Engine, ExecutionItemUtils, type HostRuntime } from '@starships/autopilot';

const hostRuntime: HostRuntime = {
  http: async ({ method, url, headers = {}, body, timeoutMs, responseType }) => {
    const controller = new AbortController();
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const finalMethod = String(method || 'GET').toUpperCase();
      const init: RequestInit = { method: finalMethod, headers: headers as any, signal: controller.signal };
      if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
        // Support raw binary upload (ArrayBuffer) as well as normal JSON/string bodies.
        init.body = typeof body === 'string' || body instanceof ArrayBuffer ? (body as any) : JSON.stringify(body);
        const h = new Headers(init.headers as any);
        if (typeof body !== 'string' && !(body instanceof ArrayBuffer) && !h.has('content-type')) h.set('content-type', 'application/json');
        init.headers = h;
      }
      const resp = await fetch(url, init);
      const contentType = resp.headers.get('content-type') || '';
      const respBody =
        responseType === 'arrayBuffer'
          ? await resp.arrayBuffer()
          : responseType === 'text'
            ? await resp.text()
            : contentType.includes('application/json')
              ? await resp.json().catch(() => resp.text())
              : await resp.text();
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
      ref: 'download',
      type: 'http_request',
      name: 'Download bytes',
      parameters: {
        method: 'GET',
        // URLs are passed as initial input via Start (see createExecution(...) below).
        url: '{{ String(input?.downloadUrl ?? "") }}',
        responseType: 'arrayBuffer',
        binaryKey: 'payload',
        timeout: 30000,
      },
    },
    {
      ref: 'upload',
      type: 'http_request',
      name: 'Upload bytes',
      parameters: {
        method: 'PUT',
        url: '{{ String(input?.uploadUrl ?? "") }}',
        bodyFromBinaryKey: 'payload',
        timeout: 30000,
      },
    },
    {
      ref: 'e',
      type: 'end',
      name: 'End',
      parameters: { output: '{{ lastOutputOf("upload") }}' },
    },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'download' },
    { ref: 'e2', from: 'download', to: 'upload' },
    { ref: 'e3', from: 'upload', to: 'e' },
  ],
};

const engine = new Engine({ hostRuntime });
// Provide URLs as initial input so the blueprint stays pure JSON (no env()).
const exec = ExecutionItemUtils.createExecution([
  {
    json: {
      downloadUrl: 'https://example.com/download.bin',
      uploadUrl: 'https://example.com/upload.bin',
    },
  },
]);
const out = await engine.executeBlueprint(blueprint as any, exec);

// out[0].json is the http_request wrapper from the upload node:
// { status, statusText, headers, body, url }
//
// Note: exec.results is JSON-safe; binary bytes are not recorded there.
```

Cross-links

- Node reference: `node-http-request.md`
- Engine behavior: `engine.md`
