## Starships Autopilot Reference

This folder documents the Engine/Eval and each Autopilot node type with precise, testable specifications.

- Core
  - [Engine](./engine.md)
  - [Eval](./eval.md)
- [Start](./node-start.md)
- [End](./node-end.md)
- [Conditional](./node-conditional.md)
- [Transform](./node-transform.md)
- [Mutate](./node-mutate.md)
- [Code](./node-code.md)
- [HttpRequest](./node-http-request.md)
- [LLM](./node-llm.md)
- [UserPrompt](./node-user-prompt.md)
- [Workflow](./node-workflow.md)
- [Tool](./node-tool.md)
- [Agent](./node-agent.md)

- Connectors
  - [Overview](./connectors/README.md)
  - [Runtime config](./connectors/runtime-config.md)
  - [LinkedIn](./connectors/linkedin.md)
  - [Discord](./connectors/discord.md)
  - [Google Drive](./connectors/google-drive.md)
  - [GitHub](./connectors/github.md)

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

- You can paste the Blueprint (DSL) JSON directly into a TypeScript file as `const blueprint = <that JSON>` and run it with `new Engine().executeBlueprint(...)`.
- Provide any non-secret configuration via `new Engine({ runtimeEnv })` and subscribe to `eventCallback` if you need streaming/events. LLM/API keys are read from the host environment or managed via server-side connectors, not passed through the blueprint.

Examples

- [example-01-minimal-start-llm-end.md](./example-01-minimal-start-llm-end.md)
- [example-02-llm-with-upstream-input.md](./example-02-llm-with-upstream-input.md)
- [example-03-function-calling-basic-tool.md](./example-03-function-calling-basic-tool.md)
- [example-04-http-request-transform.md](./example-04-http-request-transform.md)
- [example-05-conditional-routing.md](./example-05-conditional-routing.md)
- [example-06-inline-operations.md](./example-06-inline-operations.md)
- [example-07-agent-default-blueprint.md](./example-07-agent-default-blueprint.md)
- [example-08-error-handling-modes.md](./example-08-error-handling-modes.md)
- [example-09-events-and-streaming.md](./example-09-events-and-streaming.md)
- [example-10-kitchen-sink.md](./example-10-kitchen-sink.md)
- [example-11-quirks-and-gotchas.md](./example-11-quirks-and-gotchas.md)
- [example-12-resume-and-visit-limits.md](./example-12-resume-and-visit-limits.md)

Notes:

- Template expressions use `{{ ... }}` and are resolved by the Engine prior to handler execution (full-only mode). Inline fields are executed post-handler; see Engine.
- Execution input/output items are arrays of `ExecutionItem` internally; examples show plain JSON for clarity.

For authenticated external APIs, the **GitHub connector** docs are the canonical reference:

- See `connectors/github.md` for how `connector: "github"` works with relative URLs (for example `"/user"`, `"/user/repos"`, `"/repos/{owner}/{repo}/issues"`) and OAuth App user tokens.
- Use the GitHub examples as a model when designing tools for other connectors (LinkedIn, Discord, Google Drive) that rely on HttpRequest + connector + full-string templates.
