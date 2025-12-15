## Node: Agent

What it is: High-level orchestrator that assembles a complete tool-capable conversation loop around an LLM. If no blueprint is supplied, it generates one that supports tool detection, execution, result incorporation, and iterative continuation.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/Agent.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - name: string (required)
  - description?: string
  - model: string (required)
  - temperature?: number (0..2)
  - maxTokens?: number (>= 1)
  - timeout?: number (>= 1000)
  - systemPrompt?: string
  - state?: {
    - messages?: LlmMessage[]
    - tools?: ToolParams[]
  }
  - blueprint?: Blueprint (optional; default generated if omitted)
  - metadata?: Record<string, unknown>

Generated default blueprint (when omitted)
- Nodes (refs fixed for template usage):
  - start ("Start")
  - llm (ref: "ai_assistant") with `messages: {{ state.messages }}`, `tools: {{ state.tools }}`
  - conditional ("Check Tool Calls") which returns:
    - "continue" (if finishReason === "length")
    - "init_tool_calls" (if one or more tool calls are present)
    - "complete" otherwise
  - mutate ("Init Tool Calls Batch") — stores `pendingToolCalls` and resets `pendingToolCallIndex` to 0
  - conditional ("Process Tool Calls") which returns:
    - "call_tool" (if current pending tool call is allowed by `state.tools`)
    - "tool_not_allowed" (if current pending tool call is not allowed)
    - "done_tools" (when all pending tool calls have been processed)
  - code ("Prepare Tool Args") — materializes current pending tool call arguments into a plain object
  - tool ("Execute Tool") — resolves name/description/schema/blueprint from `state.tools` by slug for the current pending tool call
  - mutate ("Add Tool Result") — appends `{ role: 'tool', toolCallId, content }` and advances `pendingToolCallIndex`
  - mutate ("Handle Disallowed Tool") — appends structured error tool message and advances `pendingToolCallIndex`
  - end ("End")
- Edges:
  - start → llm
  - llm → conditional
  - conditional → llm on "continue"
  - conditional → mutate (Init Tool Calls Batch) on "init_tool_calls"
  - conditional → end on "complete"
  - mutate (Init Tool Calls Batch) → conditional (Process Tool Calls)
  - conditional (Process Tool Calls) → code on "call_tool"
  - code → tool
  - tool → mutate (Add Tool Result)
  - mutate (Add Tool Result) → conditional (Process Tool Calls)
  - conditional (Process Tool Calls) → mutate (Handle Disallowed Tool) on "tool_not_allowed"
  - mutate (Handle Disallowed Tool) → conditional (Process Tool Calls)
  - conditional (Process Tool Calls) → llm on "done_tools"

Execution behavior
- Execution state is created; `state` (messages/tools) is merged into `execution.state`.
- Ordered messages:
  - systemPrompt (if provided) → state.messages → input messages (if input is `LlmMessage[]`)
- `state.tools` is stored in `execution.state.tools` for use in LLM node templates.
- When the LLM returns multiple tool calls in a single response, they are executed sequentially (in-order) before resuming the LLM.
- Depth-aware runner selection; events from nested nodes stream through.
- Validates required fields (name, model) and blueprint start node presence.

Validation rules
- timeout >= 1000ms, temperature 0..2, maxTokens >= 1
- With a provided blueprint: must contain a start node; edges must reference existing node refs.

Use cases
- Tool-enabled assistants that need iterative reasoning and function execution.
- Drop-in agent with minimal configuration that can still be customized via `state` and `systemPrompt`.

Example (minimal)

```ts
import { Agent } from "@starships/autopilot";

const agent = new Agent({
  name: "Assistant",
  model: "anthropic/claude-3.5-sonnet",
  systemPrompt: "Be helpful and concise.",
  state: {
    messages: [{ role: "user", content: "Hello!" }],
    tools: [
      {
        name: "Echo",
        slug: "echo",
        description: "Echo back text",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"]
        },
        blueprint: {
          nodes: [
            { ref: "s", type: "start", name: "Start", parameters: {} },
            { ref: "e", type: "end", name: "End", parameters: { output: '{{ input }}' } }
          ],
          edges: [{ ref: "e1", from: "s", to: "e" }]
        }
      }
    ]
  }
});
const result = await agent.execute();
```

Cross-links
- See LLM for streaming/function-calling behavior and events.
- See Tool for argument extraction and structured error payloads.


