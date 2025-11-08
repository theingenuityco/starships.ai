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

Notes:

- Template expressions use `{{ ... }}` and are resolved by the Engine prior to handler execution (full-only mode). Inline fields are executed post-handler; see Engine.
- Execution input/output items are arrays of `ExecutionItem` internally; examples show plain JSON for clarity.
