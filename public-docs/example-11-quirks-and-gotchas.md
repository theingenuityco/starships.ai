## Example 11 — Quirks and gotchas

- Tool arguments must be objects
  - Good: upstream input `{ a: 1, b: 2 }`
  - Bad: upstream input `"{"a":1,"b":2}"` (string) → Tool throws: arguments must be a plain object
  - Use a Code node to parse strings before Tool.

- LLM tool-call concurrency
  - The LLM node delegates provider configuration to the host runtime. If you need to disable parallel tool calls (provider hint), do it in `hostRuntime.llm`.
  - Regardless, the Engine/Agent patterns typically **execute tool calls sequentially** (in-order) once toolCalls are observed.

- `lastOutputOf(ref)` behavior
  - Returns `undefined` if the ref hasn’t produced output yet in the current execution history.
  - Common mistake: referencing a node in a different (nested) workflow scope (you’ll still get `undefined`).

- GET/HEAD requests never include a body
  - Even if you specify `body`, HttpRequest omits it for GET/HEAD.

- Template evaluation mode is full-only for parameters
  - Strings must be a single `{{ ... }}` to be evaluated; no partial concatenations during parameter resolution.
  - **Bad (partial templates)**:
    - `url: "/repos/{{ input.owner }}/{{ input.repo }}?state={{ input.state || 'open' }}"`
  - **Good (single full-string template)**:
    - `url: "{{ '/repos/' + input.owner + '/' + input.repo + '?state=' + (input.state || 'open') }}"`
  - For complex URLs, prefer either:
    - One expression that returns the final URL string, or
    - A Code node that returns `{ url }`, then an HttpRequest node with `url: "{{ (lastOutputOf('build_url') || {}).url }}"`.
  - For connector-backed calls, use `connector_action` (not `http_request`). See `connectors/README.md`.

- Mutate vs Transform
  - Transform changes input→output; Mutate changes `execution.state`.
  - Inline transforms on non-dedicated nodes run post-handler and see that node’s output as `input`.

- End node final output shape
  - Engine unwraps `{ result }` from End node to become the final return value.

### HTTP body and data flow

- Parameters use stringEvaluationMode: full-only. When you template `parameters.body` (for example `{{ input }}`), the resolved value is passed directly to the host runtime: strings are sent as-is and objects are JSON-stringified with `Content-Type: application/json`. Prefer passing objects from upstream via explicit templates or literals rather than manually stringifying JSON.
- HttpRequest returns `{ status, statusText, headers, body, url }`. To pass only the payload to the next request, forward `body` via Transform/Code. See Node: HttpRequest.
- Initial arguments are exposed as `input` after `start`; from later nodes, use `ctx.lastOutputOf('__initial__')`. See Node: Start and Node: Code.

### Debugging and convergence checklist

- Confirm endpoint and schema first; pick one API path and stick to it until fixed.
- Add a Code node before/after critical nodes to `console.log('DEBUG input', ctx.input)` and verify shapes.
- Validate required fields early; fail fast with clear error messages.
- Prefer simplifying data flow (start → code → http_request → end) before adding extra nodes.
- Avoid replacing HttpRequest with custom fetch unless you hit a documented limitation.
