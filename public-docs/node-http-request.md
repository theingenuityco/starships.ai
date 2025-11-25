## Node: HttpRequest

What it is: Typed HTTP client node using native `fetch`, producing structured responses and failing on non-2xx results.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/HttpRequest.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - url: string (required) — absolute (`https://...`) or relative (`/path`) when used with connectors
  - method: string (required) — one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  - headers?: Record<string,string> | Headers | [string, string][]
  - body?: object | string | null
  - timeout?: number (ms; default 30000)
  - connector?: string (optional) — logical connector name used by the HostRuntime for auth/URL handling; the exact values are defined by the host environment
  - Additional fields on `HttpRequestParams` are typed to be compatible with `RequestInit`, but the current host runtime only uses: method, url, headers, body, timeoutMs, connector

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
  - If it starts with `http://` or `https://`, it must be a valid absolute URL.
  - Relative URLs (starting with `/`) are allowed and are normalized by the HostRuntime (for example when using connectors).
- method required; must be one of the supported methods.
- timeout (if provided) must be >= 1000ms.

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

### Using connectors

- `connector` is an optional logical name understood by the HostRuntime. It controls how URLs are normalized and how auth headers are injected; the `HttpRequest` node itself just forwards `connector` to the runtime.
- When `url` is relative (starts with `/`), the HostRuntime will typically prefix it with a base API URL configured in the host environment.
- If you explicitly set an `Authorization` header in `parameters.headers`, it always takes precedence; connector logic should not override it.
- The concrete connector names and their behaviors (for example which auth headers they inject or how they normalize URLs) are defined by the host runtime and deployment configuration, not by the Autopilot engine itself.

Example (blueprint using a connector)

```ts
{
  ref: "http_call",
  type: "http_request",
  name: "Call external service via connector",
  parameters: {
    method: "GET",
    // Relative path; HostRuntime/connector will resolve it against its base API URL
    url: "/some/resource",
    // Logical connector name understood by the HostRuntime; may be static or resolved from templates/env
    connector: "my-connector",
    timeout: 5000
  }
}
```

If `connector` is omitted or set to an unrecognized string, the request behaves like a normal HTTP call; the HostRuntime may still normalize relative URLs according to its configuration, but no connector-specific auth behavior is guaranteed.

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


