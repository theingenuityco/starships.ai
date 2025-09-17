# @starships/autopilot

Lean workflow execution engine for starships.ai - executes blueprint-based workflows with AI model integration and dynamic state management.

## Overview

Autopilot executes workflows defined as node graphs (blueprints) with support for:

- **Dynamic Node Loading** - AI agents, LLM calls, HTTP requests, conditionals, transforms
- **Template Expressions** - `{{ state.value }}` syntax for dynamic parameters
- **State Management** - JSON Patch transforms for workflow state mutations
- **Memory System** - Structured memory for AI agent interactions
- **Credential Management** - Secure API key handling

## Quick Start

```bash
pnpm install @starships/autopilot
```

### Basic Usage

```typescript
import { Engine, Agent, autopilot } from '@starships/autopilot';

// Configure credentials
autopilot.setCredentials({
  openrouterApiKey: 'sk-or-v1-your-key',
});

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
    transforms: [{ operation: 'add', path: '/state/greeting', value: '{{ $nodeResult("llm_1").data }}' }],
  });

// Execute agent
const execution = await agent.execute();
console.log('Results:', execution.results);
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

| Type           | Description          | Key Parameters                                          |
| -------------- | -------------------- | ------------------------------------------------------- |
| `start/end`    | Flow control         | `{}`                                                    |
| `llm`          | LLM API calls        | `model`, `messages`, `temperature`                      |
| `agent`        | AI agent with memory | `name`, `model`, `memoryState` (systemPrompt, messages) |
| `http_request` | HTTP API calls       | `url`, `method`, `headers`, `body`                      |
| `conditional`  | Branch workflows     | `condition` (JSONata expression)                        |
| `transform`    | State mutations      | `transforms` (JSON Patch operations)                    |
| `workflow`     | Nested workflows     | `blueprint`                                             |
| `user_prompt`  | User interaction     | Platform-specific                                       |

## Template Expressions

Use `{{ }}` syntax for dynamic values:

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
      data: '{{ $nodeResult("input").data.formData }}'
    }
  }
}
```

**Available Context:**

- `state` - Current workflow state
- `results` - Previous node results
- `$now()` - Current timestamp
- `$nodeResult(ref)` - Get result from specific node
- `$random()` - Generate random ID

## State Management

### Inline Transforms

Any node can include `transforms` for state mutations:

```typescript
{
  ref: 'api-call',
  type: 'http_request',
  parameters: {
    url: 'https://api.example.com/data',
    transforms: [
      { operation: 'replace', path: '/state/apiCalls', value: '{{ (state.apiCalls || 0) + 1 }}' },
      { operation: 'add', path: '/state/lastCall', value: '{{ $now() }}' }
    ]
  }
}
```

### Transform Operations

JSON Patch operations for state mutations:

```typescript
[
  { operation: 'add', path: '/state/user', value: { id: '123', name: 'John' } },
  { operation: 'replace', path: '/state/counter', value: '{{ state.counter + 1 }}' },
  { operation: 'remove', path: '/state/temp' },
  { operation: 'copy', path: '/state/backup', from: '/state/current' },
  { operation: 'move', path: '/state/archive', from: '/state/old' },
];
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
    transforms: [{ operation: 'add', path: '/state/lastResponse', value: '{{ $nodeResult("llm_1").data }}' }],
  });

// Execute the agent
const execution = await agent.execute();
```

### Agent Memory System

```typescript
import { AgentMemory } from '@starships/autopilot';

// Create simple agent memory
const memory = new AgentMemory({
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
  memoryState: {
    systemPrompt: 'You are Sarah, a support agent. Be helpful and professional.',
    messages: [
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi! How can I help you today?' },
    ],
  },
});
```

## Events & Streaming

```typescript
const eventCallback = async (event) => {
  switch (event.type) {
    case 'workflow_started':
    case 'workflow_completed':
    case 'node_started':
    case 'node_completed':
    case 'content_chunk': // LLM streaming
      console.log(event.type, event.data);
  }
};

const engine = new Engine({ blueprint, eventCallback });
```

## API Reference

### Main Exports

```typescript
// Engine and Agent
export { Engine, Agent } from '@starships/autopilot';

// Node handlers
export { LLM, HttpRequest, Workflow, Conditional, Transform } from '@starships/autopilot';

// Memory
export { AgentMemory } from '@starships/autopilot';

// Configuration
export { autopilot } from '@starships/autopilot';

// Types
export type {
  Blueprint,
  Node,
  Execution,
  ConditionalResult,
  TransformOperation,
  AgentParams,
  AgentMemoryState,
} from '@starships/autopilot';
```

### Credential Management

```typescript
// Set credentials (required for LLM nodes)
autopilot.setCredentials({ openrouterApiKey: 'sk-or-...' });

// Check if credentials are available
if (!autopilot.hasOpenRouterApiKey()) {
  throw new Error('OpenRouter API key required');
}
```

## LLM Models

Uses OpenRouter API for 200+ models:

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

- **jsonata** - JSONata expressions for templates/conditions
- **fast-json-patch** - JSON Patch operations for transforms
- **nanoid** - Unique ID generation

---

Part of the [starships.ai](/) monorepo.
