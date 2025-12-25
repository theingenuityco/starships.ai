## Node: ConnectorAction

What it is: Executes a connector template endpoint (an “action”) via `hostRuntime.connectorAction`. This is how Starships tools call external APIs with server-injected auth (OAuth/API keys/platform JWT) without exposing secrets to the blueprint.

Specification (authoritative)

- Handler: `packages/autopilot/src/nodes/ConnectorAction.ts`
- Runtime implementation (runner): `packages/autopilot-runner/src/hostRuntime/RunnerHostRuntime.ts` (`connectorAction`)
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - connector: string (required) — connector slug/provider (e.g. `"github"`, `"discord"`, `"google_drive"`, `"linkedin"`, `"starships"`)
  - action: string (required) — endpoint name from the connector template (e.g. `"list-issues"`)
  - args?: Record<string, unknown> (optional)
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

Validation rules

- `connector` required (non-empty after template resolution)
- `action` required (non-empty after template resolution)

Important notes (current behavior)

- This node does **not** perform connector mapping/auth itself. The host runtime owns:
  - base URL resolution
  - auth header injection (sessions)
  - mapping `args` into path/query/headers/body
- In `autopilot-runner` today, endpoint JSON Schema validation (`endpoint.parameters`) exists in types but is **not enforced** at runtime.

Template rules (full-string only)

- The Engine enforces full-only templates. If you need to build `args` dynamically:
  - Use a full-string template that returns an object, e.g. `args: "{{ ({ owner: input.owner, repo: input.repo }) }}"`
  - Or use a Code node to construct `{ args }` and pass it as upstream input (then omit `parameters.args`).

Example (GitHub list issues)

```ts
{
  ref: "github_list_issues",
  type: "connector_action",
  name: "GitHub: List Issues",
  parameters: {
    connector: "github",
    action: "list-issues",
    args: { owner: "octo-org", repo: "octo-repo", state: "open" },
    timeout: 15000
  }
}
```

Cross-links

- See `connectors/README.md` and `connectors/configuration.md` for connector templates, auth models, and endpoint mapping.
- See `node-http-request.md` for raw absolute HTTP calls without connector auth/mapping.


