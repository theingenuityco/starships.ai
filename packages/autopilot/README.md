# @starships/autopilot

Lean workflow execution engine for starships.ai - executes blueprint-based workflows with AI model integration and dynamic state management.

## Overview

Autopilot executes workflows defined as node graphs (blueprints) with support for:

- **Dynamic Node Loading** - AI agents, LLM calls, HTTP requests, conditionals, transforms, mutations
- **Template Expressions** - `{{ jsExpression }}` JavaScript expression syntax for dynamic parameters
- **State Management** - JSON Patch transforms for workflow state mutations
- **Memory System** - Structured memory for AI agent interactions
- **Credential Management** - Secure API key handling
- **Error Handling** - Configurable failure modes with resilient execution options

## Quick Start

```bash
pnpm install @starships/autopilot
```

### Basic Usage

```typescript
import { Engine, Agent, config } from '@starships/autopilot';

// Note: Credentials are typically managed at the application level
// The autopilot package focuses on workflow execution

// Create and configure an agent
const agent = new Agent({
  name: 'Assistant',
  model: 'anthropic/claude-3.5-sonnet',
});

// Add nodes to the agent's blueprint
agent
  .addNode('llm', 'Greeting', {
    model: 'anthropic/claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Hello!' }],
  })
  .addNode('transform', 'Store Result', {
    transforms: [{ operation: 'add', path: '/state/greeting', value: '{{ $lastOutputOf("llm_1") }}' }],
  });

// Execute agent
const execution = await agent.execute();
console.log('Results:', execution);
```

### Engine Usage

```typescript
// Create workflow blueprint directly
const blueprint = {
  nodes: [
    { ref: 'start', type: 'start', name: 'Begin', parameters: {} },
    {
      ref: 'llm',
      type: 'llm',
      name: 'AI Response',
      parameters: {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      },
    },
    { ref: 'end', type: 'end', name: 'Complete', parameters: {} },
  ],
  edges: [
    { ref: 'edge-1', from: 'start', to: 'llm' },
    { ref: 'edge-2', from: 'llm', to: 'end' },
  ],
  metadata: {},
};

// Execute workflow with Engine
const engine = new Engine({
  eventCallback: (event) => console.log(event.type),
});

const execution = ExecutionItemUtils.createExecution();
await engine.executeBlueprint(blueprint, execution);
console.log('Results:', execution.results);
```

## Error Handling

The Engine supports configurable error handling through the `failOnNodeError` flag:

```typescript
// Default behavior: fail execution on any node error (failOnNodeError: true)
const strictEngine = new Engine({
  eventCallback: (event) => console.log(event.type),
  // failOnNodeError defaults to true
});

// Continue execution even when individual nodes fail
const resilientEngine = new Engine({
  eventCallback: (event) => console.log(event.type),
  failOnNodeError: false,
});
```

**Configuration Options:**

- `failOnNodeError: true` (default) - Workflow execution stops immediately when any node fails
- `failOnNodeError: false` - Workflow continues execution despite individual node failures

When `failOnNodeError` is false:

- Failed nodes still record errors in execution results
- Full error details are still set in the execution context
- `workflow_failed` events are still emitted for individual node failures
- Execution status is reset to 'running' and continues to the next node
- Overall workflow completes normally with `workflow_completed` event
- All error information is preserved in the final execution results

## Node Types

| Type           | Description              | Key Parameters                                          |
| -------------- | ------------------------ | ------------------------------------------------------- |
| `start/end`    | Flow control             | `{}`                                                    |
| `llm`          | LLM API calls            | `model`, `messages`, `temperature`                      |
| `agent`        | AI agent with memory     | `name`, `model`, `memoryState` (systemPrompt, messages) |
| `http_request` | HTTP API calls           | `url`, `method`, `headers`, `body`                      |
| `conditional`  | Branch workflows         | `condition` (JavaScript expression)                     |
| `transform`    | Input transformations    | `transforms` (JSON Patch operations)                    |
| `mutate`       | State mutations          | `mutations` (JSON Patch operations)                     |
| `tool`         | Function calling support | `name`, `description`, `parameters`                     |
| `workflow`     | Nested workflows         | `blueprint`                                             |
| `user_prompt`  | User interaction         | Platform-specific                                       |

## Template Expressions

Use `{{ }}` syntax for JavaScript expressions:

```typescript
{
  ref: 'api-call',
  type: 'http_request',
  parameters: {
    url: 'https://api.example.com/users/{{ state.userId }}',
    headers: {
      Authorization: 'Bearer {{ state.auth.token }}'
    },
    body: {
      timestamp: '{{ $now() }}',
      data: '{{ $lastOutputOf("input") }}'
    }
  }
}
```

**Available Context:**

- `state` - Current workflow state
- `outputs` - All previous node results (array format)
- `status` - Current execution status
- `input` - Current input data
- `$lastOutputOf(nodeRef)` - Get latest result from specific node
- `$input(path)` - Extract data from input using dot notation
- `$random()` - Generate random number
- `$exists(value)` - Check if value exists

## State Management

### Inline Operations

Any node can include inline operations for processing:

```typescript
{
  ref: 'api-call',
  type: 'http_request',
  parameters: {
    url: 'https://api.example.com/data',
    // Inline input transformation
    transforms: [
      { operation: 'add', path: '/processedAt', value: '{{ $now() }}' }
    ],
    // Inline state mutation
    mutations: [
      { operation: 'replace', path: '/state/apiCalls', value: '{{ (state.apiCalls || 0) + 1 }}' },
      { operation: 'add', path: '/state/lastCall', value: '{{ $now() }}' }
    ],
    // Inline conditional logic
    condition: 'state.retryCount < 3'
  }
}
```

### Transform vs Mutate Operations

- **Transform** - Processes input data before passing to the node
- **Mutate** - Modifies global workflow state after node execution

```typescript
// Transform: modify input data
{ operation: 'add', path: '/userId', value: '{{ state.currentUser.id }}' }

// Mutate: modify workflow state
{ operation: 'replace', path: '/state/counter', value: '{{ state.counter + 1 }}' }
```

## Agent API

### Creating and Configuring Agents

```typescript
import { Agent } from '@starships/autopilot';

// Create agent with required parameters
const agent = new Agent({
  name: 'MyAgent',
  model: 'anthropic/claude-3-haiku',
  temperature: 0.7,
  maxTokens: 1024,
});

// Add nodes to build the agent's workflow
agent
  .addNode('llm', 'Think', {
    model: 'anthropic/claude-3-haiku',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What can you help me with?' },
    ],
    temperature: 0.8,
  })
  .addNode('transform', 'Store Response', {
    transforms: [{ operation: 'add', path: '/lastResponse', value: '{{ $lastOutputOf("llm_1") }}' }],
  });

// Execute the agent
const execution = await agent.execute();
```

### Agent Memory System

```typescript
import { AgentMemory, Memory } from '@starships/autopilot';

// Create agent memory with identity and purpose
const memory = new AgentMemory({
  identity: {
    name: 'Sarah',
    role: 'Support Agent',
    personality: 'helpful and professional',
  },
  purpose: {
    goal: 'Assist customers with their inquiries',
    capabilities: ['answer questions', 'provide guidance', 'escalate issues'],
    limitations: ['cannot process payments', 'cannot access external systems'],
  },
  systemPrompt: 'You are Sarah, a helpful support agent.',
  messages: [
    { role: 'user', content: 'I need help' },
    { role: 'assistant', content: "I'm here to help! What can I assist you with?" },
  ],
});

// Memory operations
memory.setSystemPrompt('You are a helpful assistant specialized in customer support.');
memory.addMessage({ role: 'user', content: 'New user message' });

const messages = memory.toMessages(); // Format for LLM (systemPrompt + messages)

// Use memory in agent constructor
const agent = new Agent({
  name: 'Sarah',
  model: 'anthropic/claude-3-haiku',
  memoryState: memory.getState(),
});
```

### Base Memory Class

```typescript
import { Memory } from '@starships/autopilot';

// Simple message-only memory
const simpleMemory = new Memory({
  messages: [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi! How can I help you today?' },
  ],
});

simpleMemory.addMessage({ role: 'user', content: 'What can you do?' });
const allMessages = simpleMemory.toMessages();
```

## Events & Streaming

```typescript
const eventCallback = async (event) => {
  switch (event.type) {
    case 'workflow_started':
    case 'workflow_completed':
    case 'workflow_failed':
    case 'workflow_paused':
    case 'workflow_resumed':
    case 'node_started':
    case 'node_completed':
    case 'node_failed':
    case 'content_chunk': // LLM streaming
      console.log(event.type, event.data);
  }
};

const engine = new Engine({ eventCallback });
```

## Extending with BaseNode

Create custom nodes by extending BaseNode:

```typescript
import { BaseNode } from '@starships/autopilot';
import { ExecutionItem, ValidationResult, NodeHandlerOptions } from '@starships/autopilot';

interface CustomParams extends BaseParams {
  operation: string;
  value: number;
}

export class CustomNode extends BaseNode<CustomParams> {
  constructor(params: CustomParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const inputValue = ExecutionItemUtils.unwrapSingle(input);

    // Your custom logic here
    const result = { operation: params.operation, result: inputValue + params.value };

    return ExecutionItemUtils.wrapSingle(result, input?.[0]);
  }

  validate(): ValidationResult {
    const errors = [];
    const params = this.getParams();

    // Use BaseNode validation helpers
    const operationError = this.validateRequiredField(params.operation, 'Operation');
    if (operationError) errors.push(operationError);

    const valueError = this.validateRequiredField(params.value, 'Value');
    if (valueError) errors.push(valueError);

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
```

## API Reference

### Main Exports

```typescript
// Core classes
export { Engine, Agent, BaseNode } from '@starships/autopilot';

// Node handlers
export { LLM, HttpRequest, Tool, Workflow, Conditional, Transform, Mutate } from '@starships/autopilot';

// Memory system
export { Memory, AgentMemory } from '@starships/autopilot';

// Evaluation engine
export { Eval } from '@starships/autopilot';

// Configuration and utilities
export { config, ExecutionItemUtils } from '@starships/autopilot';

// Types
export type {
  Blueprint,
  Node,
  Edge,
  Execution,
  ExecutionItem,
  ConditionalResult,
  TransformOperation,
  AgentParams,
  AgentMemoryState,
  MemoryState,
  ValidationResult,
  NodeParameters,
} from '@starships/autopilot';
```

### Configuration

```typescript
import { config } from '@starships/autopilot';

// Access configuration constants
console.log('Max nodes:', config.MAX_NODES);
console.log('Execution timeout:', config.EXECUTION_TIMEOUT);

// Built-in timeouts and limits
const limits = {
  approvalTimeout: config.APPROVAL_TIMEOUT,
  executionTimeout: config.EXECUTION_TIMEOUT,
  userPromptTimeout: config.USER_PROMPT_TIMEOUT,
  agentExecutionTimeout: config.AGENT_EXECUTION_TIMEOUT,
  maxNodes: config.MAX_NODES,
  maxEdges: config.MAX_EDGES,
};
```

## Tool Calling Support

The [`Tool`](./src/nodes/Tool.ts) node provides built-in function calling capabilities:

```typescript
// Built-in tools available
const supportedTools = [
  'calculator', // Mathematical expressions
  'get_current_time', // Current timestamp with timezone support
  'echo', // Echo arguments (for testing)
];

// Tool node example
const toolNode = {
  ref: 'calc-tool',
  type: 'tool',
  name: 'Calculator Tool',
  parameters: {
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
  },
};
```

### Tool Usage Examples

```typescript
// Calculator tool
const calcResult = await toolNode.execute([
  {
    json: { expression: '2 + 3 * 4' },
    nodeRef: 'input',
  },
]);

// Current time tool
const timeResult = await toolNode.execute([
  {
    json: { timezone: 'America/New_York', format: 'locale' },
    nodeRef: 'input',
  },
]);
```

## LLM Models

Supports various LLM providers and models:

- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4-turbo`
- `google/gemini-pro-1.5`
- `meta-llama/llama-3.1-405b-instruct`

## Development

```bash
pnpm run build        # Build package
pnpm run type-check   # Type checking
pnpm run lint         # Lint code
pnpm run test         # Run tests
```

## Dependencies

- **fast-json-patch** - JSON Patch operations for transforms/mutations
- **nanoid** - Unique ID generation

## Additional Documentation

- **[Tool Calling Guide](./README-TOOLS.md)** - Complete guide to implementing and using function calling with LLMs

---

Part of the [starships.ai](/) monorepo.
