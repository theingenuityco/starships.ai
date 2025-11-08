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
