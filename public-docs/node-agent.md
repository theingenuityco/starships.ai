## Node: Agent

What it is: High-level orchestrator that assembles a complete tool-capable conversation loop around an LLM. If no blueprint is supplied, it generates a default loop that supports tool detection, server-side tool authorization/execution, and iterative continuation.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Agent.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - name: string (required)
  - description?: string
  - model: string (required)
  - temperature?: number (0..2)
  - maxTokens?: number (>= 1)
  - timeout?: number (>= 1000)
  - reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean }
  - systemPrompt?: string
  - state?: {
    - messages?: LlmMessage[]
    - tools?: ToolParams[]
    - (optional) additional state keys used by the default blueprint: `modalities`, `imageConfig`, `pendingToolCalls`, `pendingToolCallIndex`, ...
  }
  - blueprint?: Blueprint (optional; default generated if omitted)
  - metadata?: Record<string, unknown>

Generated default blueprint (when omitted)
- Default blueprint: `Agent.defaultAgentBlueprintServerTools()` (see `packages/autopilot/src/nodes/Agent.ts`)
- Key behavior: tool calls are **not executed locally** from tool blueprints in state. Instead, each tool call is delegated to the Starships host via a **`connector_action`** call:
  - `connector: "starships"`
  - `action: "authorize-and-maybe-execute-tool"`
  - The Starships server enforces assignment and allow/ask/deny policies; it may return `TOOL_APPROVAL_REQUIRED`.
- If the server responds with `TOOL_APPROVAL_REQUIRED`, the default blueprint appends a tool message and ends the workflow turn.

Execution behavior
- Execution state is created; `state` (messages/tools) is merged into `execution.state`.
- Ordered messages:
  - systemPrompt (if provided) → state.messages → input messages (if input is `LlmMessage[]`)
- `state.tools` is stored in `execution.state.tools` for use in LLM node templates.
- When the LLM returns multiple tool calls in a single response, they are executed sequentially (in-order) before resuming the LLM.
- Depth-aware runner selection; events from nested nodes stream through.
- Validates required fields (name, model) and blueprint start node presence.
- Host requirements for the default blueprint:
  - `hostRuntime.llm` must be configured (for the LLM node)
  - `hostRuntime.connectorAction` must be configured (for the `connector_action` node)
  - `runtimeEnv.CONVERSATION_ID` and `runtimeEnv.AGENT_ID` must be set (used by the server authorization call)

Validation rules
- timeout >= 1000ms, temperature 0..2, maxTokens >= 1
- With a provided blueprint: must contain a start node; edges must reference existing node refs.

Use cases
- Starships-hosted tool-enabled assistants that need server-side authorization/approval.
- Drop-in agent loop for the hosted product where the host owns tool execution and secrets.

Example (minimal)

```ts
import { Agent, type HostRuntime } from "@starships/autopilot";

// NOTE: The default Agent blueprint delegates tool execution to the Starships server via connector_action.
// This example is intended for the hosted Starships environment (or a host that provides an equivalent
// `starships` connector template endpoint).
const hostRuntime = {} as HostRuntime; // provided by host (server), not by the blueprint

const agent = new Agent(
  {
    name: "Assistant",
    model: "anthropic/claude-3.5-sonnet",
    systemPrompt: "Be helpful and concise.",
    state: {
      messages: [{ role: "user", content: "Hello!" }],
      tools: [{ name: "Echo", slug: "echo", description: "Echo back text", parameters: { type: "object", properties: { text: { type: "string" } } } }],
    },
  },
  {
    hostRuntime,
    runtimeEnv: { AGENT_ID: "<agent-id>", CONVERSATION_ID: "<conversation-id>" },
  }
);
const result = await agent.execute();
```

Cross-links
- See LLM for streaming/function-calling behavior and events.
- See Tool for argument extraction and structured error payloads.


