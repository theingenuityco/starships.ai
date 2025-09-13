# @starships/autopilot

Workflow execution engine and agent development framework for starships.ai, providing a clean and simple approach to workflow orchestration with AI model integration.

## Overview

Autopilot provides a lightweight workflow execution system with:

- **Engine** - Core workflow execution engine with dynamic node loading
- **Node System** - Clean node handlers for different task types (Agent, LLM, HTTP, Workflow)
- **Memory Management** - Simple memory system for AI interactions
- **Credential Management** - Secure API key handling for external services
- **Event-driven Architecture** - Comprehensive lifecycle hooks for streaming and monitoring

## Installation & Setup

```bash
pnpm install @starships/autopilot
```

## Credential Configuration

Autopilot requires manual credential configuration for API access (LLM models, HTTP requests with authentication, etc.). Credentials must be configured before using nodes that require them.

### Setting Up Credentials

```typescript
import { autopilot } from '@starships/autopilot';

// Configure OpenRouter API key for LLM nodes
autopilot.setCredentials({
  openrouterApiKey: 'sk-or-v1-your-api-key-here',
});

// Verify credentials are set
if (!autopilot.hasOpenRouterApiKey()) {
  throw new Error('OpenRouter API key is required for LLM functionality');
}
```

### Server Integration

For server applications, configure credentials during startup:

```typescript
import { autopilot } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';

const config = getEnvConfig();

// Configure credentials from environment
autopilot.setCredentials({
  openrouterApiKey: config.OPENROUTER_API_KEY,
});
```

**Note**: Autopilot does not automatically read environment variables. Credentials must be explicitly configured using `autopilot.setCredentials()`.

## Core Components

### Engine

The Engine is the core workflow execution system that handles dynamic node loading and execution:

```typescript
import { Engine } from '@starships/autopilot';

const engine = new Engine({
  blueprint: {
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
  },
  eventCallback: (event) => console.log('Event:', event),
});

await engine.execute();
console.log('Results:', engine.getExecution().results);
```

### Node Handlers

Each node type has its own handler class that implements the execution logic:

#### Workflow Node

```typescript
import { Workflow } from '@starships/autopilot';

const workflowParams = {
  blueprint: {
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
  },
};

const eventCallback = (event) => console.log('Workflow event:', event);
const workflow = new Workflow(workflowParams, eventCallback);
const results = await workflow.execute();
```

#### Agent Node

```typescript
import { Agent } from '@starships/autopilot';

const agentParams = {
  name: 'Support Agent',
  model: 'anthropic/claude-3.5-sonnet',
  memoryState: {
    identity: { name: 'Alex', role: 'Support Agent' },
    purpose: { primary: 'Help customers effectively' },
  },
  blueprint: {
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
  },
};

const eventCallback = (event) => console.log('Agent event:', event);
const agent = new Agent(agentParams, eventCallback);
const results = await agent.execute();
```

#### LLM Node

```typescript
import { LLM } from '@starships/autopilot';

const llmParams = {
  model: 'anthropic/claude-3.5-sonnet',
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' },
  ],
  temperature: 0.7,
  maxTokens: 1000,
};

const eventCallback = (event) => console.log('LLM event:', event);
const llm = new LLM(llmParams, eventCallback);
const response = await llm.execute();
```

#### HTTP Request Node

```typescript
import { HttpRequest } from '@starships/autopilot';

const httpParams = {
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: { Authorization: 'Bearer token' },
  body: { query: 'search term' },
  timeout: 30000,
};

const httpRequest = new HttpRequest(httpParams);
const response = await httpRequest.execute();
```

#### Conditional Node

```typescript
import { Conditional } from '@starships/autopilot';

const conditionalParams = {
  expression: 'state.userLevel = "premium"', // JSONata expression against execution state
  timeout: 5000,
};

const conditional = new Conditional(conditionalParams, {
  eventCallback: (event) => console.log('Conditional event:', event),
  execution: currentExecution, // Access to workflow state and results
});
const result = await conditional.execute();
console.log('Condition result:', result.condition); // true/false or string
```

**JSONata Expression Context:**

- `state` - Current workflow execution state
- `results` - Previous node execution results
- `status` - Workflow execution status
- `currentNodeRef` - Currently executing node reference

**Example expressions:**

- `state.user.isPremium = true` - Check state value
- `results[-1].data.isValid` - Check last executed node result
- `results[$ ~> $filter(function($v) { $v.nodeRef = "user_check" })][-1].data.isValid` - Get most recent result from specific node
- `status = "running"` - Check execution status

## Memory System

Autopilot includes a simple memory system for managing AI interactions:

### Base Memory

```typescript
import { Memory } from '@starships/autopilot';

const memory = new Memory({
  messages: [{ role: 'system', content: 'You are a helpful assistant' }],
});
memory.addMessage({ role: 'user', content: 'Hello!' });

const messages = memory.toMessages();
```

### Agent Memory

Enhanced memory with structured context:

```typescript
import { AgentMemory } from '@starships/autopilot';

const agentMemory = new AgentMemory();

// Set structured context
agentMemory.setIdentity({
  name: 'Sarah',
  role: 'Support Agent',
  personality: 'Professional and helpful',
});

agentMemory.setPurpose({
  primary: 'Resolve customer issues',
  constraints: ['Be professional', 'Escalate complex issues'],
});

agentMemory.setSpace({
  description: 'Customer support chat environment',
});

// Add messages
agentMemory.addMessageToHistory({
  role: 'user',
  content: 'I need help with billing',
});

// Get formatted messages for LLM
const messages = agentMemory.toMessages();
```

## Node Types

The engine supports these node types through dynamic loading:

- **start/end** - Flow control nodes
- **agent** - AI agent with embedded workflow execution
- **workflow** - Execute nested workflow blueprints
- **llm** - Large Language Model interactions via OpenRouter
- **http_request** - HTTP API calls with full fetch API support
- **user_prompt** - Interactive user input (implementation varies by platform)
- **conditional** - JSONata expression evaluation for workflow branching

## API Reference

### Main Exports

```typescript
// Core engine
export { Engine } from '@starships/autopilot';

// Node handlers
export { Workflow, LLM, HttpRequest, Agent, Conditional } from '@starships/autopilot';

// Memory system
export { Memory, AgentMemory } from '@starships/autopilot';

// Configuration
export { autopilot, config } from '@starships/autopilot';

// Types
export type { Blueprint, Node, AgentIdentity, AgentMemoryState, LlmMessage } from '@starships/autopilot';
```

### Event System

The engine supports event callbacks for monitoring and streaming:

```typescript
const eventCallback = async (event) => {
  console.log(`Event: ${event.type} at ${event.timestamp}`);
  // Handle workflow_started, workflow_completed, node_started, etc.
};

const engine = new Engine({
  blueprint,
  eventCallback,
});
```

## LLM Integration

LLM nodes use OpenRouter's unified API, providing access to 200+ models:

### Popular Models

- `anthropic/claude-3.5-sonnet` - Anthropic Claude 3.5 Sonnet
- `openai/gpt-4-turbo` - OpenAI GPT-4 Turbo
- `google/gemini-pro-1.5` - Google Gemini Pro 1.5
- `meta-llama/llama-3.1-405b-instruct` - Meta Llama 3.1 405B

### Streaming Support

LLM nodes automatically support streaming with event callbacks:

```typescript
const llmParams = {
  model: 'anthropic/claude-3.5-sonnet',
  messages: [{ role: 'user', content: 'Tell me a story' }],
};

const eventCallback = async (event) => {
  if (event.type === 'content_chunk') {
    console.log('Streaming chunk:', event.data.chunk);
  }
  if (event.type === 'content_complete') {
    console.log('Streaming complete');
  }
};

const llm = new LLM(llmParams, eventCallback);
const response = await llm.execute();
```

## Development

```bash
# Build the package
pnpm run build

# Type check
pnpm run type-check

# Lint code
pnpm run lint

# Run tests
pnpm run test

# Development mode with watch
pnpm run dev
```

## Dependencies

### Core Dependencies

- **jsonata** - JSONPath expressions for conditional logic
- **nanoid** - Unique identifier generation

## Architecture

```
src/
├── index.ts                 # Main exports and public API
├── Autopilot.ts             # Configuration and credential management
├── engine/                  # Workflow execution engine
│   └── Engine.ts            # Core execution engine with dynamic loading
├── nodes/                   # Node handler implementations
│   ├── Agent.ts             # Agent node handler
│   ├── Workflow.ts          # Workflow node handler
│   ├── LLM.ts               # LLM node handler
│   ├── HttpRequest.ts       # HTTP request handler
│   ├── Start.ts             # Start node handler
│   ├── End.ts               # End node handler
│   └── UserPrompt.ts        # User prompt handler
├── memory/                  # Memory management system
│   ├── Memory.ts            # Base memory class
│   └── AgentMemory.ts       # Enhanced agent memory
├── types/                   # TypeScript type definitions
└── constants/               # Configuration constants
```

## Related Packages

This package is part of the starships.ai monorepo:

- [`@starships/protocol`](../protocol/) - Shared types and contracts
- [`@starships/server`](../server/) - API server implementation
- [`@starships/models`](../models/) - Database models and repositories

## License

Private package - Part of the starships.ai project
