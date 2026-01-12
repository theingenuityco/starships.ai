## Node: ConnectorAction

What it is: Executes a connector template endpoint (an “action”) via `hostRuntime.connectorAction`. This is how Starships tools call external APIs with server-injected auth (OAuth/API keys/basic auth/platform JWT) without exposing secrets to the blueprint.

## When `connector_action` is necessary (not optional)

Use `connector_action` when **any** of the following are true:

- You need **auth injection** (OAuth tokens, API keys, platform JWT) that must not be visible to the blueprint.
- You need **Basic auth** (RFC 7617) that must not be visible to the blueprint.
- You want the host to own **base URL resolution** + **path/query/header/body mapping** via `connector_templates`.
- You are using the **default `Agent` blueprint in Starships**, which delegates tool authorization/execution to the server.

Use `http_request` only for raw absolute `http(s)://...` calls where you are not relying on connector templates/sessions.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/ConnectorAction.ts`
- Runtime implementation (runner): `packages/autopilot-runner/src/hostRuntime/RunnerHostRuntime.ts` (`connectorAction`)
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - connector: string (required) — connector slug/provider (e.g. `"starships"` or any provider configured via `connector_templates`)
  - action: string (required) — endpoint name from the connector template (e.g. `"list-issues"`)
  - args?: Record<string, unknown> (optional)
  - failOnNon2xx?: boolean (optional; default false) — when true, the node throws on non-2xx responses
  - timeout?: number (ms; default 30000)

Execution behavior

- Requires `hostRuntime.connectorAction` to be available; otherwise throws:
  - `"Host runtime connectorAction() not available for ConnectorAction node"`
- Determines call arguments:
  - If `parameters.args` is present: uses it
  - Else: falls back to upstream input (`input?.[0]?.json`) if it’s an object
  - Else: uses `{}`
- Calls:
  - `hostRuntime.connectorAction({ connector, action, args, timeoutMs })`

- Wraps the host response into a single `ExecutionItem` with this JSON shape:

```ts
{ status: number, statusText: string, headers: Record<string, unknown>, body: unknown, url: string }
```

Error behavior (important)

- `connector_action` **does not throw by default** on non-2xx HTTP statuses.
  - Non-2xx responses are returned as normal output via the `{ status, body, ... }` wrapper.
  - If you want a non-2xx connector call to be treated as a workflow/tool failure, you can enable:
    - `parameters.failOnNon2xx: true` (recommended when you want “fail-fast” behavior)
  - Alternatively (or when you want custom logic), you can still **explicitly throw** via a downstream `code` node that checks `status`.

Example pattern (throw on non-2xx)

Option A (preferred): enable `failOnNon2xx` on the connector_action node and only unwrap in code

```js
async function main(ctx) {
  const resp = ctx.lastOutputOf('some_connector_action') || {};
  return resp?.body?.data ?? resp?.body;
}
```

Option B: explicit throw in code (when you need conditional handling)

Validation rules

- `connector` required (non-empty after template resolution)
- `action` required (non-empty after template resolution)

Important notes (current behavior)

- This node does **not** perform connector mapping/auth itself. The host runtime owns:
  - base URL resolution
  - auth header injection (sessions)
  - mapping `args` into path/query/headers/body
- In `autopilot-runner` today, endpoint JSON Schema validation (`endpoint.parameters`) exists in types but is **not enforced** at runtime.

## Hosted tool execution (Starships internal connector)

In the Starships hosted product, the default `Agent` blueprint executes tools by calling a Starships internal connector endpoint:

- `connector: "starships"`
- `action: "authorize-and-maybe-execute-tool"`

This is how Starships enforces **tool assignment** and **allow/ask/deny** policies and executes tools without exposing secrets in the blueprint.

Requirements:

- The Engine must be constructed with:
  - `hostRuntime.connectorAction` (and usually `hostRuntime.llm` for the LLM node)
  - `runtimeEnv.AGENT_ID` and `runtimeEnv.CONVERSATION_ID` (used by the default Agent blueprint)

Example (as used by the default Agent blueprint):

```ts
{
  ref: "auth_and_execute",
  type: "connector_action",
  name: "Authorize & Execute Tool (Server)",
  parameters: {
    connector: "starships",
    action: "authorize-and-maybe-execute-tool",
    args: {
      agentId: '{{ String(env("AGENT_ID") ?? "") }}',
      conversationId: '{{ String(env("CONVERSATION_ID") ?? "") }}',
      toolSlug: '{{ /* tool slug from pending toolCalls[] */ "" }}',
      toolCallId: '{{ /* tool call id from pending toolCalls[] */ "" }}',
      args: '{{ /* plain-object tool args */ ({}) }}'
    },
    timeout: 120000
  }
}
```

On failure, the Starships endpoint may respond with an error code like `TOOL_APPROVAL_REQUIRED`; the default Agent blueprint stops the workflow turn in that case.

Note on response semantics (Starships hosted)

- The `authorize-and-maybe-execute-tool` endpoint returns an **application-level contract** (typically over HTTP 200):
  - success: `{ success: true, data: { toolCallId, result } }`
  - error: `{ success: false, error: { code, message, details } }`
- In the default Agent loop, tool call success/failure is determined by this envelope. The Agent loop does not inspect the inner `result` payload to infer failure.

Template rules (full-string only)

- The Engine enforces full-only templates. If you need to build `args` dynamically:
  - Use a full-string template that returns an object, e.g. `args: "{{ ({ owner: input.owner, repo: input.repo }) }}"`
  - Or use a Code node to construct `{ args }` and pass it as upstream input (then omit `parameters.args`).

Example (connector_action list issues)

```ts
{
  ref: "connector_list_issues",
  type: "connector_action",
  name: "Connector: List Issues",
  parameters: {
    connector: "example",
    action: "list-issues",
    args: { owner: "octo-org", repo: "octo-repo", state: "open" },
    timeout: 15000
  }
}
```

Cross-links

- See `../connectors/README.md` and `../connectors/connector_templates.md` for connector templates, auth models, and endpoint mapping.
- See `node-http-request.md` for raw absolute HTTP calls without connector auth/mapping.
- See `node-agent.md` for the default hosted Agent behavior (server-side tool authorization/execution).
