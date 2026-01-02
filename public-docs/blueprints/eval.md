## Eval (Expression Evaluation)

What it is: Centralized template evaluation system used by Engine and nodes. Supports `{{ ... }}` JavaScript expressions with controlled context and helpers.

Authoritative implementation: `packages/autopilot/src/engine/Eval.ts`

Template syntax

- Templates are JavaScript expressions wrapped in `{{ ... }}`.
- Engine uses `stringEvaluationMode: 'full-only'` for parameter resolution, which means a string parameter must be a single template to be evaluated. Mixed literal + template is not allowed in handler parameter resolution to reduce ambiguity.
- Inline operations may use the same mode unless explicitly noted by the caller (Engine uses full-only).

Context (`EvalContext`)

- state: `ExecutionState`
- outputs: `Array<{ nodeRef: string; items: ExecutionItem[] }>` (ordered history)
- status: `ExecutionStatus`
- currentNodeRef?: string
- input: unknown (the unwrapped input for the current evaluation)
- Helpers:
  - lastOutputOf(nodeRef: string): unknown — returns latest output json for a nodeRef:
    - 0 items → `undefined`
    - 1 item → `item.json`
    - N>1 items → `item.json[]`
  - exists(value: unknown): boolean
  - env(key: string): unknown — host-provided runtime env lookup (values come from `Engine({ runtimeEnv })`)

Notable behaviors

- `lastOutputOf(ref)` returns `undefined` when the referenced node has not produced output yet (or does not exist in the current execution history).
- Expressions are sanitized to unescape common JSON-escaped sequences before compiling.
- Recursion limits apply during traversal for resolution (implementation internal).

Validation

- `validateTemplateExpressions(value)` returns a `ValidationResult` with errors (if any). Engine uses this to validate node parameter objects and inline operations during `validateForExecution`.

Security

- Expressions are evaluated using `new Function(...)` with `with (ctx) { ... }`. This is **not a hardened sandbox**. If you execute untrusted blueprints, you must run Autopilot inside an isolate (child process/container/VM) or replace Eval with a hardened evaluator.

Cross-links

- See `engine.md` for when and how Eval is invoked for handler parameters vs inline operations.
- See node docs for parameter fields that accept template expressions.

Common mistakes and how to fix them

- Partial templates in full-only contexts
  - Problem: "Hello {{ name }}" will not evaluate where the engine enforces full-only mode (most parameter and inline contexts). It will be returned literally.
  - Fix: Make the entire value a single template that returns the final string:
    - Correct: "{{ `Hello ${input.name}` }}"

- “Nested eval” attempts
  - Problem: Writing {{ "{{ state.x }}" }} expecting a second evaluation pass.
  - Fix: Evaluate once with the desired final value:
    - Correct: "{{ String(state.x) }}"
  - Note: Nested blueprints (objects with `nodes[]` and `edges[]`, or under `blueprint` / `tools[].blueprint`) are protected from evaluation and will be resolved only in their own scope.

- Mixing literals with templates for Transform/Conditional
  - Problem: Using partial templates inside `transform.value`, `transform.from`, or `condition`.
  - Fix: Use a single expression that returns the final value:
    - Transform value example: "{{ input.user.first + ' ' + input.user.last }}"
    - Conditional example: "{{ state.retryCount < 3 ? 'retry' : 'stop' }}"

- HttpRequest URL/body building (full-only templates)
  - Problem: Using partial templates in `parameters.url` or `parameters.body` (for example, `"/repos/{{ input.owner }}/{{ input.repo }}/issues?state={{ input.state || 'open' }}"`).
  - Fix: Either:
    - Use a single full-string template: `url: "{{ '/repos/' + input.owner + '/' + input.repo + '/issues?state=' + (input.state || 'open') }}"`, or
    - Build `{ url }` in a Code node and reference it from HttpRequest: `url: "{{ (lastOutputOf('build_url') || {}).url }}"`.
  - See `node-http-request.md` and `node-code.md` for end-to-end examples.

- Connector-backed calls
  - Use `connector_action` (not `http_request`) when you need baseUrl/auth/mapping managed by the host runtime.
  - See `../connectors/README.md` and `../connectors/connector_templates.md`.
