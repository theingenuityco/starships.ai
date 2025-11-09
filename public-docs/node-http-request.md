## Node: HttpRequest

What it is: Typed HTTP client node using native `fetch`, producing structured responses and failing on non-2xx results.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/HttpRequest.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - url: string (required)
  - method: string (required) — one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  - headers?: Record<string,string> | Headers | [string, string][]
  - body?: object | string | null
  - timeout?: number (ms; default 30000)
  - All standard `RequestInit` fields supported: mode, credentials, cache, redirect (default 'follow'), referrer, referrerPolicy, integrity, keepalive

Body selection rules
- Compute `method = (parameters.method || 'GET').toUpperCase()`
- If method is GET or HEAD => never send a body (even if provided)
- Else, if `parameters.body` is defined => use it
- Else, if upstream input exists => use unwrapped input as body
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
- url required; must be a valid URL.
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

Cross-links
- See Transform for output reshaping after an HTTP call.
- See Engine for template resolution rules applied to parameters.

### Notes

- Parameters use stringEvaluationMode: full-only. Don’t template `parameters.body` (e.g., `{{ $input }}`) as this produces a string. Either omit `body` and pass an object from upstream, or use a literal object. See Engine → Template resolution rules.
- When chaining requests, remember HttpRequest returns a wrapper (see Return value shape). If you need only the payload for the next request, forward `body` via a Transform/Code node.


