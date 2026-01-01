## Starships Public Docs

This folder contains documentation for the Starships workflow system, including blueprint/node references, connectors, and widgets.

- **Blueprints (Autopilot)**
  - [Blueprints reference](./blueprints/README.md)

- **Connectors**
  - [Connectors reference](./connectors/README.md)
  - [Connector templates](./connectors/connector_templates.md)

- **Widgets**
  - [Widgets](./widgets/README.md)

Audience and access modes

These docs are used by two audiences:

1. Agents inside Starships (DSL-only)

- Can create/manipulate blueprints (nodes/edges/parameters) via tools.
- Cannot import SDKs, run `new Engine()`, or execute TypeScript directly.
- What to use in these docs: sections labeled "Blueprint (DSL)" which contain JSON-only blueprints you can emit via your DSL tools.

2. Humans/agents outside Starships (SDK/Engine)

- Have access to `@starships/autopilot` and can run TypeScript/Node.
- What to use in these docs: sections labeled "SDK/Engine code" showing how to execute a blueprint.

Conventions in this documentation

- Examples provide both:
  - Blueprint (DSL): pure JSON blueprint suitable for DSL creation tools.
  - SDK/Engine code: TypeScript showing how to execute the same blueprint with the Engine.
- If an example shows only TypeScript with `const blueprint = { ... }`, agents inside Starships can copy just the object literal as JSON to produce the identical DSL.
- Node reference pages include parameter specs that apply equally to DSL and SDK usage; template resolution semantics are enforced by the Engine at runtime either way.

Tips for agents (DSL-only)

- Use the blueprint JSON as-is; do not include imports or code that constructs/executes an engine.
- When a snippet shows templates like `{{ lastOutputOf("llm")... }}`, keep them as-is in node `parameters`—the Engine resolves them at execution time.
- Prefer stable node refs (e.g., "llm", "tool", "e") because examples and templates reference them.

Tips for SDK/Engine users

- You can paste the Blueprint (DSL) JSON directly into a TypeScript file as `const blueprint = <that JSON>`.
- To actually execute it, you typically need to construct the Engine with a `hostRuntime`:
  - `http_request` requires `hostRuntime.http`
  - `llm` and `agent` require `hostRuntime.llm`
  - `connector_action` requires `hostRuntime.connectorAction`
- Provide any non-secret configuration via `new Engine({ runtimeEnv })` and subscribe to `eventCallback` if you need streaming/events. Credentials are owned by the host (environment variables, secret stores, OAuth sessions) and are not passed through the blueprint.

Examples

Blueprint examples live under [Blueprints reference](./blueprints/README.md#examples).

Notes:

- Template expressions use `{{ ... }}` and are resolved by the Engine prior to handler execution (full-only mode). Inline fields are executed post-handler; see Engine.
- Execution input/output items are arrays of `ExecutionItem` internally; examples show plain JSON for clarity.

For authenticated external APIs via connectors:

- See `public-docs/connectors/README.md` and `public-docs/connectors/connector_templates.md` for how `connector_action` works with connector templates and injected auth (OAuth2/API key/basic/platform JWT).
- Use the generic `connector_action` patterns as a model when designing tools for any connector-backed integration (not `http_request`) so the host can inject auth and base URLs.
