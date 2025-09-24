# Tool Calling in Autopilot

This document explains how to implement and use function calling (tools) in the autopilot package.

## Overview

The tool calling system allows LLMs to dynamically call functions during their execution. The architecture consists of:

- **Tool Node**: Executes tool logic as regular workflow nodes
- **LLM Node**: Includes tools in OpenRouter function calling format
- **Agent**: Orchestrates tool calling loop via dynamic blueprint generation

## Implementation

### 1. Tool Definition

Define tools using `ToolParams`:

```typescript
import { ToolParams } from '@starships/autopilot';

const calculatorTool: ToolParams = {
  name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate',
      },
    },
    required: ['expression'],
  },
};
```

### 2. Agent with Tools

Create an agent with tools enabled:

```typescript
import { Agent, autopilot } from '@starships/autopilot';

// Configure API key
autopilot.setCredentials({
  openrouterApiKey: 'sk-or-v1-your-key',
});

const agent = new Agent({
  name: 'MathAssistant',
  model: 'anthropic/claude-3.5-sonnet',
  tools: [calculatorTool], // Tools array enables function calling
});

// Execute with user input
const result = await agent.execute('What is 25 * 4 + 17?');
```

### 3. Tool Execution

- Tools must include a `blueprint` in `ToolParams`.
- The Tool node executes that blueprint using a fresh Engine + Execution (same pattern as the Workflow node).
- Pass any runtime configuration as regular tool arguments; they will be available as initial input (`$json`) to the tool blueprint.

- The Tool node is a lightweight wrapper and is intentionally stateless. It has no knowledge of LLMs, execution context, or agent state.
- The Tool node does not inspect prior LLM outputs or tool_calls. Orchestrators must pass tool arguments explicitly via the Tool node's input; these will be available as the initial `$json` for the tool blueprint.

## Architecture Details

### Agent Blueprint Generation

When an agent has tools, it automatically creates a dynamic blueprint:

```
Start -> LLM -> Conditional(has tool_calls?)
  -> Yes: Tool -> Mutate(append result) -> Back to LLM
  -> No: End
```

### Tool Execution Flow

1. **LLM Node**: Receives messages, includes tools schema, may respond with tool_calls
2. **Conditional Node**: Checks if LLM wants to call tools
3. **Tool Node**: Executes the requested tool
4. **Mutate Node**: Appends tool result to conversation
5. **Loop**: Returns to LLM with tool result until no more tool calls

### Template Expressions

The system uses JavaScript template expressions for dynamic data access:

```javascript
// Check for tool calls
`$exists($lastOutputOf("llm_1")[0].json.choices[0].message.tool_calls)`
// Get tool name
`{{ $lastOutputOf("llm_1")[0].json.choices[0].message.tool_calls[0].function.name }}`
// Convert tool result to string
`{{ String($lastOutputOf("tool_1")[0].json) }}`;
```

## Usage Examples

### Simple Calculator

```typescript
const agent = new Agent({
  name: 'Calculator',
  model: 'anthropic/claude-3-haiku',
  tools: [calculatorTool],
});

const result = await agent.execute('Calculate 15 * 7 + 23');
```

### Multi-Tool Agent

```typescript
const agent = new Agent({
  name: 'Assistant',
  model: 'anthropic/claude-3.5-sonnet',
  tools: [calculatorTool, timeTool, echoTool],
});

const result = await agent.execute('What time is it in Tokyo and what is 42 * 17?');
```

### Conversational Tool Use

```typescript
const agent = new Agent({
  name: 'ConversationAssistant',
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a helpful math assistant.',
  state: {
    tools: [calculatorTool],
    messages: [],
  },
});

// First message
await agent.execute('What is 25 + 17?');

// Follow-up (remembers context)
await agent.execute('Now multiply that by 3');
```

## Extending with Custom Tools

Define a custom tool entirely in data by embedding a Blueprint in `ToolParams`. When a `blueprint` is present, the Tool node executes it using the same Engine + Execution pattern as the Workflow node. The tool call arguments (from the LLM or provided input) are passed as the initial input to the blueprint.

Example:

```typescript
import { ToolParams } from '@starships/autopilot';

export const sendEmailTool: ToolParams = {
  name: 'send_email',
  description: 'Send an email via HTTP API',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body (text)' },
      apiKey: { type: 'string', description: 'API key for the provider' },
    },
    required: ['to', 'subject', 'body', 'apiKey'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'http_1',
        type: 'http_request',
        name: 'Send Email',
        description: 'Call provider API',
        parameters: {
          url: 'https://example-mail.api/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer {{ $json.apiKey }}',
          } as unknown as HeadersInit,
          body: {
            to: '{{ $json.to }}',
            subject: '{{ $json.subject }}',
            body: '{{ $json.body }}',
          },
        },
      },
      { ref: 'end_1', type: 'end', name: 'Done', description: '', parameters: {} },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'http_1' },
      { ref: 'e2', from: 'http_1', to: 'end_1' },
    ],
    metadata: {},
  },
};
```

Notes:

- No code changes required for new tools. Provide `ToolParams` with a `blueprint`, and include it in the agent’s `tools` array for function calling schema.
- Pass any configuration/secrets as normal tool arguments (e.g., `apiKey`). The Tool node forwards arguments as the initial input (`$json`) of the blueprint.

## Key Benefits

- **Clean Architecture**: Each component has single responsibility
- **Reuses Infrastructure**: Leverages existing nodes, templates, mutations
- **No External Dependencies**: Uses existing autopilot components
- **Dynamic Execution**: Creates tool calling loops automatically
- **Memory Integration**: Works with agent memory system

## Error handling and loop prevention

- Tools execute their own blueprint with failOnNodeError enabled. On failure, the Tool node returns an ExecutionItem that sets `error` and also provides `json` with a structured payload:
  - `{ ok: false, error: "<message>", details: { stack?: string, nodeRef?: string, depth: number, runner: "local" | "child", toolName: string, toolCallId?: string, timestamp: string } }`
  - This allows inline mutations to execute and publish a detailed tool message for the LLM.
- The Agent’s default blueprint serializes the `json` payload when present (including `details`). If `json` is missing, it falls back to the `error` string. The tool role message therefore contains all available diagnostics that the LLM can reason about.
- This prevents infinite loops when a tool fails (for example, tool_smoke_test), because the LLM now receives a concrete tool response (even on failure) and can proceed without repeatedly issuing the same tool call.
