## Engine

What it is: Deterministic workflow executor for DAGs of nodes. Resolves parameter templates, executes nodes in sequence, applies inline operations, emits events, and computes next edges from conditional results.

Authoritative implementation: `packages/autopilot/src/engine/Engine.ts`

Key responsibilities

- Parameter template resolution (via Eval) before handler execution (full-only mode).
- Sequential node execution with visit-count safeguards (cycle support).
- Inline operations support on any node:
  - transforms: input->output JSON Patch operations (post-handler; skipped on dedicated Transform node)
  - reducers: state mutations via Mutate (post-handler; skipped on dedicated Mutate node)
  - condition: compute `edgeCondition` (post-handler; skipped on dedicated Conditional node)
- Event emission for workflow/node lifecycle and content streaming.
- Depth-aware runner selection delegated to runner implementations.

Template resolution rules

- Dedicated nodes (`transform`, `mutate`, `conditional`):
  - Entire parameters object is resolved pre-execution.
- Other nodes:
  - Non-inline handler parameters are resolved pre-execution.
  - Inline fields (`transforms`, `reducers`, `condition`) are held raw and executed post-handler using the current node’s output (`transforms`) or current execution state (`reducers`), or in the case of inline `condition`, to synthesize `edgeCondition`.
- All string template evaluations use `stringEvaluationMode: 'full-only'` (the entire string must be a single template), preventing accidental partial replacements.

Execution lifecycle

1. Validate blueprint: must have a `start` node; node templates and inline ops validated via virtual handlers.
2. Determine starting node (resume supported via `execution.currentNodeRef`).
3. For each node:
   - Set `execution.currentNodeRef` and derive input from latest output of the upstream node.
   - Resolve handler parameters (templates) as per rules above.
   - Create handler and validate.
   - Execute handler; record primary result in `execution.results`.
   - Execute inline transforms (post-handler) on the handler output and record a result entry.
   - Execute inline reducers (post-handler) to mutate state and record a result entry.
   - Execute inline condition (post-handler) to produce an `edgeCondition` result (unless already present).
   - Emit `node_completed` or `node_failed`.
   - Choose next node by matching `edgeCondition` to outgoing edges; fallback preference: `'false'` edge, then no-condition edge.
4. On completion, if an End node output contains `{ result }`, unwrap and return it as the workflow’s final value; else return `execution.results`.

Events (via `eventCallback`)

- workflow_started, workflow_completed, workflow_failed
- workflow_paused, workflow_resumed (via `pause`/`resume`)
- node_started, node_completed, node_failed
- content_chunk, content_complete (forwarded from LLM)
- tool_call_detected (forwarded from LLM), tool_started, tool_complete (from Tool)
- Events include `executionDepth`.

Error handling

- Configuration: `failOnNodeError` (default true).
  - true: first node error stops execution, marks workflow failed, emits `workflow_failed`.
  - false: records error result for the node and continues to compute next node; workflow completes with accumulated results.
- Execution-level errors (validation etc.) mark workflow failed and emit `workflow_failed`.

Visit limits

- `config.MAX_NODE_VISITS` caps per-node visits to prevent infinite loops; on exceed, workflow completes without error and returns.

Edge selection algorithm (detailed)

- Engine first scans recent results after the current node's primary result for an inline entry containing `{ edgeCondition }`.
- If none found, it looks at the node's primary output for `{ edgeCondition }` (e.g., Conditional node).
- It selects the outgoing edge whose `condition` equals that value. Fallback order:
  - explicit `'false'` edge
  - edge with no condition
  - else: stop (no next node)

Runtime configuration and secrets

- When embedding the Engine directly (SDK usage), hosts must provide a `hostRuntime` if they want to use nodes that perform side effects:
  - `http_request` requires `hostRuntime.http`
  - `llm` and `agent` require `hostRuntime.llm`
  - `connector_action` requires `hostRuntime.connectorAction`
- Hosts may pass non-secret configuration via `Engine({ runtimeEnv })`. At runtime, templates can read these values via `env('KEY')` and Code nodes can read them via `ctx.env('KEY')`.
- In the hosted Starships product, the server supplies `runtimeEnv` (for example `STARSHIP_ID`, `CONVERSATION_ID`, `SERVER_URL`) and a connector/LLM-capable `hostRuntime`. Blueprints never receive raw API keys or OAuth tokens.

Cross-links

- See `eval.md` for template expression capabilities and context.
- See each node’s doc for node-specific behavior and validation.
- See `node-http-request.md` and `node-code.md` for concrete examples of full-string template rules (`"{{ ... }}"` only) and the recommended Code + HttpRequest URL-building pattern.
- See `connectors/README.md` and `connectors/connector_templates.md` for connector behavior (auth injection + baseUrl + mapping) when using the `connector_action` node.
