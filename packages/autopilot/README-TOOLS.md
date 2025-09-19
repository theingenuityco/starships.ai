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

### 3. Built-in Tools

The system includes several built-in tools:

#### Calculator

- **Name**: `calculator`
- **Purpose**: Mathematical calculations
- **Parameters**: `expression` (string)

#### Current Time

- **Name**: `get_current_time`
- **Purpose**: Get current date/time
- **Parameters**: `timezone` (optional), `format` (optional)

#### Echo

- **Name**: `echo`
- **Purpose**: Testing and debugging
- **Parameters**: `message` (string), `metadata` (optional object)

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

The system uses JSONata template expressions for dynamic data access:

```javascript
// Check for tool calls
`$exists($lastOutputOf("llm_1")[0].json.choices[0].message.tool_calls)`
// Get tool name
`{{ $lastOutputOf("llm_1")[0].json.choices[0].message.tool_calls[0].function.name }}`
// Convert tool result to string
`{{ $string($lastOutputOf("tool_1")[0].json) }}`;
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
  tools: [calculatorTool],
  memoryState: {
    systemPrompt: 'You are a helpful math assistant.',
    messages: [],
  },
});

// First message
await agent.execute('What is 25 + 17?');

// Follow-up (remembers context)
await agent.execute('Now multiply that by 3');
```

## Extending with Custom Tools

To add custom tools, extend the Tool class and add to the HANDLER_MAP:

```typescript
// 1. Add tool type to NodeType union in types/base.ts
// 2. Add tool to HANDLER_MAP in engine/Engine.ts
// 3. Implement custom logic in Tool.executeToolLogic()
```

The current implementation supports built-in tools. For custom tools, modify the Tool class's `executeToolLogic` method to handle your specific tool names.

## Key Benefits

- **Clean Architecture**: Each component has single responsibility
- **Reuses Infrastructure**: Leverages existing nodes, templates, mutations
- **No External Dependencies**: Uses existing autopilot components
- **Dynamic Execution**: Creates tool calling loops automatically
- **Memory Integration**: Works with agent memory system
