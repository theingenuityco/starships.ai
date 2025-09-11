# @starships/autopilot

Advanced workflow execution engine and agent development framework for starships.ai, providing DAG-based workflow orchestration with AI model integration.

## Overview

Autopilot provides a comprehensive workflow execution system with:

- **Workflow Execution Engine** - Execute complex DAG-based workflows with conditional routing, interactive user prompts, and AI model integration
- **Agent System** - Sophisticated agent framework with structured memory management
- **Memory Management** - Multi-layered memory system (Memory and AgentMemory) for context-aware AI interactions
- **Node System** - Extensible node types including LLM, HTTP, conditional, and agent nodes
- **Credential Management** - Secure API key handling for external services
- **Lean Streaming Architecture** - Minimal streaming interface for external systems to provide real-time updates

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

## Workflow System

### Features

- **Graph-based execution** - True DAG support with conditional routing
- **Extensible node system** - Plugin architecture for custom node types
- **Interactive workflows** - Built-in user input capabilities
- **JSONata integration** - Powerful expressions for conditional logic
- **Event-driven** - Comprehensive lifecycle hooks
- **Visual programming** - React Flow integration ready

### Quick Start - Workflows

```typescript
import { Workflow, AgentMemory, createAgentMemory } from '@starships/autopilot';

// Create workflow using the builder pattern
const workflow = new Workflow()
  .addNode({ ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} })
  .addNode({ ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} })
  .addEdge('start', 'end');

// Validate workflow
const validation = workflow.validate();

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Create structured memory for execution context
const agentMemory = createAgentMemory('System context for workflow execution');
agentMemory.setIdentity({ role: 'Workflow Executor' });
agentMemory.setPurpose({ primary: 'Execute workflow efficiently' });

// Execute workflow with memory - engine with all handlers is created internally
const execution = {
  status: 'not_started' as const,
  executionResults: new Map(),
  agentMemory: agentMemory,
};
const result = await workflow.execute(execution);

console.log('Execution result:', result);
```

### Node Types

- **start/end** - Flow control nodes
- **agent** - AI agent task execution (integrates with agent framework)
- **conditional** - Smart routing with JSONata expressions
- **user_prompt** - Interactive user input
- **output** - Result formatting and delivery
- **http_request** - HTTP API calls with authentication and retry support
- **llm** - Large Language Model interactions (OpenAI, Anthropic, Google, etc.)
- **workflow** - Execute embedded workflow blueprints

## Memory System

Autopilot includes a sophisticated memory system built on two layers: base **Memory** for core LLM message management, and **AgentMemory** for advanced structured context with identity, purpose, space, and conversation history.

### Base Memory Class

The core memory system handles LLM-compatible messages:

```typescript
import { Memory, createMemory } from '@starships/autopilot';

// Create basic memory
const memory = new Memory('You are a helpful assistant.');

// Add messages
memory.addMessage('system', 'Focus on being concise.');
memory.addMessage('user', 'Hello!');
memory.addMessage('assistant', 'Hi! How can I help?');

// Get LLM-formatted messages
const messages = memory.toMessages();
// Result: [
//   { role: 'system', content: 'You are a helpful assistant.' },
//   { role: 'system', content: 'Focus on being concise.' },
//   { role: 'user', content: 'Hello!' },
//   { role: 'assistant', content: 'Hi! How can I help?' }
// ]
```

### AgentMemory - Advanced Structured Memory

AgentMemory extends Memory with structured context management:

```typescript
import { AgentMemory, createAgentMemory } from '@starships/autopilot';

// Create agent memory
const memory = new AgentMemory('You are a customer support agent.');

// Set structured identity
memory.setIdentity({
  name: 'Sarah',
  role: 'Senior Support Agent',
  personality: 'Professional, empathetic, solution-focused',
  expertise: ['billing', 'technical support', 'account management'],
});

// Set purpose and goals
memory.setPurpose({
  primary: 'Resolve customer issues efficiently and professionally',
  secondary: ['Build customer satisfaction', 'Identify upsell opportunities'],
  constraints: ['Never promise what cannot be delivered', 'Escalate complex technical issues'],
});

// Set space (like screenplay background)
memory.setSpace({
  description:
    'Customer support chat during business hours with customer experiencing billing issue. Mood is professional but friendly. High-volume support period requiring efficient resolution.',
});

// Add conversation history with metadata
memory.addConversation('user', 'I was charged twice this month!', {
  sentiment: 'frustrated',
  priority: 'high',
});

memory.addConversation('assistant', 'I understand your frustration. Let me check your account right away.', {
  action: 'investigating',
  empathy_level: 'high',
});

// LLM-formatted output includes structured context
const messages = memory.toMessages();
// Result: Structured system message + conversation history
```

### AgentMemory Structured Output

When `toMessages()` is called, AgentMemory creates a structured system context:

```
IDENTITY:
Name: Sarah
Role: Senior Support Agent
Personality: Professional, empathetic, solution-focused
Expertise: billing, technical support, account management

PURPOSE:
Primary Purpose: Resolve customer issues efficiently and professionally
Secondary Goals: Build customer satisfaction, Identify upsell opportunities
Constraints: Never promise what cannot be delivered, Escalate complex technical issues

SPACE:
Customer support chat during business hours with customer experiencing billing issue. Mood is professional but friendly. High-volume support period requiring efficient resolution.
```

### Memory Methods

**Base Memory:**

- `addMessage(role, content)` - Add LLM message
- `toMessages()` - Get LLM-formatted messages
- `clear()` - Clear all messages
- `getMessageCount()` - Get message count
- `getMessagesByRole(role)` - Filter by role
- `getLastMessages(count)` - Get recent messages
- `clone()` - Clone memory instance

**AgentMemory Additional:**

- `setIdentity(identity)` - Set agent identity
- `setPurpose(purpose)` - Set agent purpose
- `setSpace(space)` - Set agent space
- `addConversation(role, content, metadata?)` - Add conversation with metadata
- `addSystemPrompt(prompt)` - Legacy compatibility
- `clearConversations()` - Clear conversations only
- `getConversationHistory()` - Get conversation entries
- `getAgentStats()` - Get comprehensive statistics

### Memory in Agents

```typescript
const memory = new AgentMemory('You are a customer support agent.');
memory.setIdentity({ name: 'Alex', role: 'Support Agent' });
memory.setPurpose({ primary: 'Help customers effectively' });

const agent = new Agent({
  name: 'Support Agent',
  model: 'anthropic/claude-3.5-sonnet',
  memory: memory, // Required
  blueprint: myBlueprint,
});

// Memory automatically flows to LLM nodes with full context
```

## Node Types

Autopilot supports various node types for building complex workflows:

- **start/end** - Flow control nodes
- **agent** - AI agent task execution with embedded configuration and memory
- **conditional** - Smart routing with JSONata expressions
- **user_prompt** - Interactive user input
- **output** - Result formatting and delivery
- **http_request** - HTTP API calls with authentication and retry support
- **llm** - Large Language Model interactions (uses agent memory for context)
- **workflow** - Execute embedded workflow blueprints

## Integration Example

### Complete Workflow Example

```typescript
import { Workflow, AgentMemory } from '@starships/autopilot';

// Create structured agent memory for the workflow
const agentMemory = new AgentMemory('You are a helpful customer support assistant.');
agentMemory.setIdentity({
  name: 'AI Assistant',
  role: 'Customer Support Coordinator',
  personality: 'Professional, helpful, solution-oriented',
});
agentMemory.setPurpose({
  primary: 'Provide comprehensive customer support through multi-step workflow',
  secondary: ['Gather user data', 'Generate personalized responses', 'Process requests efficiently'],
});
agentMemory.setSpace({
  description:
    'Customer support automation system processing multi-step workflow for customer requests. Mood is professional and efficient.',
});

// Create workflow with multiple node types - all handlers are automatically available
const workflow = new Workflow()
  .addNode({
    ref: 'start',
    type: 'start',
    name: 'Start',
    description: 'Begin',
    parameters: {},
  })
  .addNode({
    ref: 'http-call',
    type: 'http_request',
    name: 'Fetch User Data',
    description: 'Get user information from API',
    parameters: {
      url: 'https://api.example.com/users/123',
      method: 'GET',
      headers: { Authorization: 'Bearer ${API_TOKEN}' },
      timeout: 10000,
      retries: 2,
    },
  })
  .addNode({
    ref: 'llm-task',
    type: 'llm',
    name: 'Generate Response',
    description: 'Create personalized response using AI',
    parameters: {
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'Generate a helpful response for the user based on their data',
      temperature: 0.7,
      maxTokens: 500,
    },
  })
  .addNode({
    ref: 'agent-task',
    type: 'agent',
    name: 'Process Request',
    description: 'Handle user request',
    parameters: {
      name: 'Support Agent',
      model: 'anthropic/claude-3.5-sonnet',
      memory: (() => {
        const agentTaskMemory = new AgentMemory('You are a helpful customer support agent.');
        agentTaskMemory.setIdentity({
          name: 'Support Agent',
          role: 'Customer Service Representative',
        });
        agentTaskMemory.setPurpose({ primary: 'Help customers with their specific requests' });
        return agentTaskMemory;
      })(),
      blueprint: {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
        metadata: {},
      },
    },
  })
  .addNode({
    ref: 'end',
    type: 'end',
    name: 'End',
    description: 'Complete',
    parameters: {},
  })
  .addEdge('start', 'http-call')
  .addEdge('http-call', 'llm-task')
  .addEdge('llm-task', 'agent-task')
  .addEdge('agent-task', 'end');

// Execute workflow with structured agent memory - engine with all node handlers is managed internally
const execution = {
  status: 'not_started' as const,
  executionResults: new Map(),
  agentMemory: agentMemory,
};
const result = await workflow.execute(execution);
```

## New Node Types

### HTTP Request Node

Makes HTTP API calls with comprehensive support for authentication, retries, and response handling.

```typescript
{
  ref: 'api-call',
  type: 'http_request',
  name: 'Call External API',
  description: 'Fetch data from external service',
  parameters: {
    url: 'https://api.example.com/data',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-token'
    },
    body: { query: 'search term' },
    timeout: 30000,
    retries: 3,
    followRedirects: true,
    authentication: {
      type: 'bearer',
      token: 'your-api-token'
    }
  }
}
```

**Authentication Types:**

- `bearer` - Bearer token authentication
- `basic` - Basic username/password authentication
- `api-key` - Custom API key in header

### LLM Node

Integrates with AI models using OpenRouter's unified API, providing access to 200+ models from various providers including OpenAI, Anthropic, Google, Meta, and more. LLM nodes automatically receive context from the agent's memory system.

```typescript
{
  ref: 'ai-response',
  type: 'llm',
  name: 'Generate AI Response',
  description: 'Create intelligent response using LLM via OpenRouter',
  parameters: {
    model: 'anthropic/claude-3.5-sonnet',
    prompt: 'Analyze this data and provide insights',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    timeout: 60000
  }
}
```

**Note**: LLM nodes automatically include system prompts and conversation history from the agent's memory. The `prompt` parameter is added as the final user message.

**Available Models (via OpenRouter):**

- `openai/gpt-4-turbo` - OpenAI GPT-4 Turbo
- `anthropic/claude-3.5-sonnet` - Anthropic Claude 3.5 Sonnet
- `google/gemini-pro-1.5` - Google Gemini Pro 1.5
- `meta-llama/llama-3.1-405b-instruct` - Meta Llama 3.1 405B
- `mistralai/mixtral-8x7b-instruct` - Mistral Mixtral 8x7B
- And 200+ more models...

**Key Features:**

- Unified API for all major LLM providers
- Automatic fallback routing
- Cost optimization
- Rate limit handling
- Model performance analytics

### Workflow Node

Executes embedded workflow blueprints, enabling modular and reusable workflow composition. Unlike agent nodes, workflow nodes focus purely on blueprint execution without agent-specific configuration.

```typescript
{
  ref: 'sub-workflow',
  type: 'workflow',
  name: 'Data Processing Pipeline',
  description: 'Execute data processing workflow',
  parameters: {
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
        {
          ref: 'fetch-data',
          type: 'http_request',
          name: 'Fetch Data',
          description: 'Get data from API',
          parameters: {
            url: 'https://api.example.com/data',
            method: 'GET',
            headers: { 'Authorization': 'Bearer {{token}}' }
          }
        },
        {
          ref: 'process-data',
          type: 'llm',
          name: 'Process Data',
          description: 'Transform data using AI',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Process this data: {{data}}'
          }
        },
        { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'fetch-data' },
        { ref: 'edge-2', from: 'fetch-data', to: 'process-data' },
        { ref: 'edge-3', from: 'process-data', to: 'end' }
      ],
      metadata: {}
    },
    timeout: 120000
  }
}
```

**Key Features:**

- **Blueprint Storage**: Store and execute complete workflow definitions
- **Modular Composition**: Build workflows from reusable sub-workflows
- **Clean Separation**: Focus on blueprint execution without agent overhead
- **Validation**: Comprehensive validation of embedded blueprints

**Use Cases:**

- Modular workflow composition
- Reusable workflow components
- Clean separation of concerns
- Sub-workflow execution within larger workflows

## API Reference

### Workflow System

#### Workflow

```typescript
const workflow = new Workflow();
const execution = {
  status: 'not_started' as const,
  executionResults: new Map(),
};
const result = await workflow.execute(execution);
```

#### Engine (Internal)

The engine is created and managed internally by the Workflow class. All supported node handlers are automatically registered:

- start/end - Flow control nodes
- agent - AI agent with embedded workflow execution
- conditional - Smart routing with JSONata expressions
- user_prompt - Interactive user input
- output - Result formatting and delivery
- http_request - HTTP API calls
- llm - Large Language Model interactions
- workflow - Execute embedded workflow blueprints

#### Validator

```typescript
const validator = new Validator();
// or use the workflow's built-in validation
const result = workflow.validate();
```

### Agent Node Configuration

Agents use the new AgentMemory system for structured context management and execute embedded workflows:

```typescript
interface AgentNodeParameters {
  // Core agent identity
  name: string;
  description?: string;

  // LLM configuration
  model: string;
  temperature?: number;
  maxTokens?: number;

  // Memory system (required)
  memory: AgentMemory;

  // Execution parameters
  timeout?: number;

  // Embedded workflow execution (required)
  blueprint: Blueprint;
}
```

Example agent node with AgentMemory and embedded workflow:

```typescript
import { AgentMemory } from '@starships/autopilot';

// Create agent memory with initial system prompt
const memory = new AgentMemory('You are a helpful customer support agent.');
memory.addSystemPrompt('Be concise and professional in responses.');

{
  ref: 'support-agent',
  type: 'agent',
  name: 'Customer Support',
  description: 'Handles customer inquiries with multi-step workflow',
  parameters: {
    name: 'Support Agent',
    model: 'anthropic/claude-3.5-sonnet',
    memory: memory, // AgentMemory instance
    temperature: 0.7,
    maxTokens: 500,
    timeout: 5000,
    // Embedded workflow that the agent will execute
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
        {
          ref: 'fetch-data',
          type: 'http_request',
          name: 'Get Customer Data',
          description: 'Fetch customer information',
          parameters: {
            url: 'https://api.example.com/customers/{{customerId}}',
            method: 'GET',
            headers: { 'Authorization': 'Bearer {{apiToken}}' }
          }
        },
        {
          ref: 'analyze',
          type: 'llm',
          name: 'Analyze Issue',
          description: 'Understand customer problem',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Analyze customer data and issue: {{customerIssue}}'
          }
        },
        { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'fetch-data' },
        { ref: 'edge-2', from: 'fetch-data', to: 'analyze' },
        { ref: 'edge-3', from: 'analyze', to: 'end' }
      ],
      metadata: {}
    }
  }
}
```

#### Agent Workflow Execution Features

- **Embedded Workflows**: Each agent node contains a complete workflow definition
- **Result Aggregation**: Workflow results are collected and returned as part of agent output
- **Comprehensive Validation**: Embedded workflows are validated for structure, nodes, and dependencies
- **Error Handling**: Robust error handling with detailed feedback on workflow execution failures

#### Agent Execution Flow

1. Agent receives parameters with embedded workflow
2. Embedded workflow is executed using the workflow engine
3. Results from all workflow nodes are collected
4. Final output includes both agent information and workflow results

Example execution result:

```typescript
{
  nodeRef: 'support-agent',
  data: {
    agentName: 'Support Agent',
    model: 'anthropic/claude-3.5-sonnet',
    workflowStatus: 'completed',
    workflowResults: [
      { message: 'Workflow started' },
      { /* http_request result with customer data */ },
      { /* llm analysis result */ },
      { message: 'Workflow completed' }
    ],
    output: 'Agent Support Agent completed workflow execution successfully'
  }
}
```

## Streaming Integration

Autopilot provides a **lean streaming architecture** that allows external systems (like servers) to inject streaming capabilities without bloating the core package.

### Key Features

- **Minimal Interface** - Only exports `StreamingEmitter` interface (~20 lines)
- **External Control** - Server handles all streaming logic and formats
- **Zero Performance Impact** - Direct injection with no latency
- **Multiple Formats** - Support SSE, WebSocket, GraphQL subscriptions

### Basic Usage

```typescript
import { StreamingEmitter } from '@starships/autopilot';

// External system implements streaming
class MyStreamingEmitter implements StreamingEmitter {
  async emitExecutionEvent(event: ExecutionEvent): Promise<void> {
    // Convert and broadcast event
  }

  isEnabled(): boolean {
    return true;
  }
}

// Inject into agent's engine
const agent = new Agent(params);
const streamingEmitter = new MyStreamingEmitter();
agent.getEngine().setStreamingEmitter(streamingEmitter);

// Execute normally - streaming happens automatically
const result = await agent.execute(execution);
```

### Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client    │◄──►│ External System  │    │ Autopilot       │
│             │    │ StreamingEmitter │◄──►│ (lean)          │
└─────────────┘    └──────────────────┘    └─────────────────┘
```

For detailed streaming integration, see [`README-STREAMING.md`](./README-STREAMING.md).

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

# Run tests with coverage
pnpm run test:coverage

# Development mode with watch
pnpm run dev
```

## Dependencies

### Core Dependencies

- **axios** - HTTP client for external API requests
- **jsonata** - JSONPath expressions for conditional routing
- **nanoid** - Unique identifier generation

## Architecture

```
src/
├── index.ts                 # Main exports and public API
├── Workflow.ts              # Core workflow execution class
├── Agent.ts                 # Agent system implementation
├── Memory.ts                # Base memory management
├── AgentMemory.ts           # Advanced structured memory
├── LLM.ts                   # Language model integrations
├── HttpRequest.ts           # HTTP request handling
├── Autopilot.ts             # Configuration management
├── engine/                  # Workflow execution engine
├── nodes/                   # Node type implementations
├── validation/              # Workflow validation system
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
