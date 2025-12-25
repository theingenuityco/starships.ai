## Node: HttpRequest

What it is: Typed HTTP client node using native `fetch`, producing structured responses and failing on non-2xx results.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/HttpRequest.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - url: string (required) — **absolute** `http(s)://...` URL
  - method: string (required) — one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  - headers?: Record<string,string> | Headers | [string, string][]
  - body?: object | string | null
  - timeout?: number (ms; default 30000)
  - Additional fields on `HttpRequestParams` are typed to be compatible with `RequestInit`, but the current host runtime only uses: method, url, headers, body, timeoutMs

Body selection rules

- Compute `method = (parameters.method || 'GET').toUpperCase()`
- If method is GET or HEAD => never send a body (even if provided)
- Else, if `parameters.body` is defined => use it
- Else => omit the body (upstream input is **not** used implicitly)
- Body serialization:
  - string => used as-is
  - object => `JSON.stringify(object)`
  - undefined => omitted

Response parsing

- Reads `content-type` header:
  - if includes `application/json` => `response.json()` with fallback to `response.text()`
  - else => `response.text()`
- Headers are returned as a plain object `{ [key: string]: string }`.

Return value (shape)

```ts
{ status: number, statusText: string, headers: Record<string,string>, body: unknown, url: string }
```

Error behavior

- Non-2xx responses => throws `Error("HTTP request failed: METHOD URL -> STATUS STATUS_TEXT | body: <snippet>")`
- Network/timeouts => throws `Error("HTTP request failed: METHOD URL -> <reason>")`
- Timeout uses AbortController; default 30000ms.

Validation rules

- url required:
  - Must be a valid absolute `http://` or `https://` URL.
- method required; must be one of the supported methods.
- timeout (if provided) must be >= 1000ms.

### Template rules (full-string only)

- The Engine resolves string parameters in **full-only** mode: a string is only evaluated when the **entire** value is a single `{{ ... }}` template.
- This applies to `url`, `headers`, and `body` on `http_request` nodes (including when you use `connector`).
- **Bad (partial templates)**:

  ```ts
  // Mixed literal + {{ ... }} segments – will be rejected by validation
  url: "/repos/{{ input.owner }}/{{ input.repo }}?state={{ input.state || 'open' }}";
  ```

- **Good (single full-string template)**:

  ```ts
  // One expression that returns the final URL string
  url: "{{ '/repos/' + input.owner + '/' + input.repo + '?state=' + (input.state || 'open') }}";
  ```

- **Good (Code + HttpRequest pattern)**:

  ```ts
  // Code node builds { url: string }
  {
    ref: "build_url",
    type: "code",
    parameters: {
      code: `
        async function main(ctx) {
          const input = ctx.input || {};
          const state = input.state || "open";
          return {
            url: "https://api.example.com/repos/" + input.owner + "/" + input.repo + "?state=" + state
          };
        }
      `,
      timeout: 2000
    }
  }

  // Downstream HttpRequest node uses a single full-string template
  {
    ref: "http_call",
    type: "http_request",
    parameters: {
      method: "GET",
      url: "{{ (lastOutputOf('build_url') || {}).url }}",
      timeout: 15000
    }
  }
  ```

Use the same pattern for `body` and `headers`: either keep them as plain JSON literals, or make the entire value a single `{{ ... }}` expression that returns the final object/string. Avoid mixing raw JSON with embedded `{{ ... }}` segments.

Example (POST JSON)

```ts
{
  ref: "fetch-post",
  type: "http_request",
  name: "Create Post",
  parameters: {
    url: "https://jsonplaceholder.typicode.com/posts",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { title: "hello", body: "world" },
    timeout: 15000
  }
}
```

### Connectors are not handled by HttpRequest (V2)

In the current runtime, **connectors are executed via the `connector_action` node**, not via `http_request`.

- Use `http_request` for **raw HTTP** to absolute URLs you fully control.
- Use `connector_action` for **connector-backed** calls (base URL + auth + mapping defined in `connector_templates`).

Cross-links

- See Transform for output reshaping after an HTTP call.
- See Engine for template resolution rules applied to parameters and how HostRuntime is constructed.

### Notes

- Parameters use stringEvaluationMode: full-only. When a template is used for `parameters.body` (for example `{{ input }}`), the resolved value is passed directly to the host runtime:
  - strings are sent as-is
  - objects are JSON-stringified by the host runtime with `Content-Type: application/json`
  - undefined is omitted
- Prefer passing objects (either from upstream `input` via an explicit template, or literals) rather than manually stringifying JSON yourself.
- When chaining requests, remember HttpRequest returns a wrapper (see Return value shape). If you need only the payload for the next request, forward `body` via a Transform/Code node.
