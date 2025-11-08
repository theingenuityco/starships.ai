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


