## Example 11 — Quirks and gotchas

- Tool arguments must be objects
  - Good: upstream input `{ a: 1, b: 2 }`
  - Bad: upstream input `"{"a":1,"b":2}"` (string) → Tool throws: arguments must be a plain object
  - Use a Code node to parse strings before Tool.

- LLM parallel tool calls disabled
  - Node sets `parallel_tool_calls: false`. Expect at most one tool call per assistant response.

- `$lastOutputOf(ref)` error surface
  - Throws with a detailed message if the ref hasn’t executed in current scope; don’t suppress.
  - Common mistake: referencing a node in a different (nested) workflow scope.

- GET/HEAD requests never include a body
  - Even if you specify `body`, HttpRequest omits it for GET/HEAD.

- Template evaluation mode is full-only for parameters
  - Strings must be a single `{{ ... }}` to be evaluated; no partial concatenations during parameter resolution.

- Mutate vs Transform
  - Transform changes input→output; Mutate changes `execution.state`.
  - Inline transforms on non-dedicated nodes run post-handler and see that node’s output as `$input()`.

- End node final output shape
  - Engine unwraps `{ result }` from End node to become the final return value.

### HTTP body and data flow

- Don’t template `parameters.body` (templates stringify). Either omit `body` and pass an object from upstream, or use a literal object. See Node: HttpRequest and Engine.
- HttpRequest returns `{ status, statusText, headers, body, url }`. To pass only the payload to the next request, forward `body` via Transform/Code. See Node: HttpRequest.
- Initial arguments are exposed as `$input` after `start`; from later nodes, use `ctx.$lastOutputOf('__initial__')[0]?.json`. See Node: Start and Node: Code.

### Debugging and convergence checklist

- Confirm endpoint and schema first; pick one API path and stick to it until fixed.
- Add a Code node before/after critical nodes to `console.log('DEBUG $input', ctx.$input)` and verify shapes.
- Validate required fields early; fail fast with clear error messages.
- Prefer simplifying data flow (start → code → http_request → end) before adding extra nodes.
- Avoid replacing HttpRequest with custom fetch unless you hit a documented limitation.


