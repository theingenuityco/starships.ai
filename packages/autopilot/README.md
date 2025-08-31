# @starships/autopilot

Workflow execution engine and agent development framework for starships.ai.

## Overview

Autopilot provides a powerful workflow execution system:

**Workflow Execution Engine** - Execute complex DAG-based workflows with conditional routing, interactive user prompts, and AI model integration

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

// Create memory for execution context
const agentMemory = createAgentMemory('System context for workflow execution');

// Execute workflow with memory - engine with all handlers is created internally
const execution = {
  status: 'not_started' as const,
  executionResults: new Map(),
  agentMemory: agentMemory
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

## AgentMemory System

Autopilot includes a powerful AgentMemory system that provides structured memory management for agents with system prompts and conversation history. This system formats data for direct consumption by LLM APIs.

### Creating and Using AgentMemory

```typescript
import { AgentMemory, createAgentMemory } from '@starships/autopilot';

// Create memory with initial system prompt
const memory = new AgentMemory('You are a helpful assistant.');

// Or use the convenience function
const memory = createAgentMemory('You are a helpful assistant.');

// Add additional system prompts (accumulative)
memory.addSystemPrompt('Focus on being concise.');
memory.addSystemPrompt('Always be professional.');

// Add conversation history
memory.addConversation('user', 'Hello, can you help me?');
memory.addConversation('assistant', 'Of course! How can I assist you?');
memory.addConversation('user', 'I need help with my account.');

// Add conversation with metadata
memory.addConversation('assistant', 'Let me check your account details.', {
  confidence: 0.95,
  source: 'account_service'
});

// Format for LLM consumption (returns array of messages)
const messages = memory.toMessages();
// Result:
// [
//   { role: 'system', content: 'You are a helpful assistant.\n\nFocus on being concise.\n\nAlways be professional.' },
//   { role: 'user', content: 'Hello, can you help me?' },
//   { role: 'assistant', content: 'Of course! How can I assist you?' },
//   { role: 'user', content: 'I need help with my account.' },
//   { role: 'assistant', content: 'Let me check your account details.' }
// ]
```

### AgentMemory Methods

- **`addSystemPrompt(prompt: string)`** - Add system prompt (accumulative)
- **`addConversation(role, content, metadata?)`** - Add conversation entry
- **`toMessages()`** - Format memory for LLM consumption
- **`clear()`** - Clear all memory
- **`clearConversations()`** - Clear only conversation history
- **`getConversationHistory()`** - Get conversation entries
- **`getSystemPrompts()`** - Get system prompts
- **`getStats()`** - Get memory statistics
- **`clone()`** - Clone memory instance

### Memory in Agents

```typescript
const memory = new AgentMemory('You are a customer support agent.');
memory.addSystemPrompt('Be helpful and professional.');

const agent = new Agent({
  name: 'Support Agent',
  model: 'anthropic/claude-3.5-sonnet',
  memory: memory, // Required
  blueprint: myBlueprint
});

// Add to memory during execution
agent.addToMemory('user', 'I have a problem with my order.');
agent.addSystemPrompt('Focus on order-related issues.');

// Memory automatically flows to LLM nodes in the workflow
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

// Create agent memory for the workflow
const agentMemory = new AgentMemory('You are a helpful customer support assistant.');
agentMemory.addSystemPrompt('Be professional and concise in responses.');

// Create workflow with multiple node types - all handlers are automatically available
const workflow = new Workflow()
  .addNode({
    ref: 'start',
    type: 'start',
    name: 'Start',
    description: 'Begin',
    parameters: {}
  })
  .addNode({
    ref: 'http-call',
    type: 'http_request',
    name: 'Fetch User Data',
    description: 'Get user information from API',
    parameters: {
      url: 'https://api.example.com/users/123',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ${API_TOKEN}' },
      timeout: 10000,
      retries: 2
    }
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
      maxTokens: 500
    }
  })
  .addNode({
    ref: 'agent-task',
    type: 'agent',
    name: 'Process Request',
    description: 'Handle user request',
    parameters: {
      name: 'Support Agent',
      model: 'anthropic/claude-3.5-sonnet',
      memory: new AgentMemory('You are a helpful customer support agent.'),
      instructions: 'Help the user',
      blueprint: {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
        metadata: {}
      }
    }
  })
  .addNode({
    ref: 'end',
    type: 'end',
    name: 'End',
    description: 'Complete',
    parameters: {}
  })
  .addEdge('start', 'http-call')
  .addEdge('http-call', 'llm-task')
  .addEdge('llm-task', 'agent-task')
  .addEdge('agent-task', 'end');

// Execute workflow with agent memory - engine with all node handlers is managed internally
const execution = {
  status: 'not_started' as const,
  executionResults: new Map(),
  agentMemory: agentMemory
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
  executionResults: new Map()
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
  instructions?: string;
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
    instructions: 'Help the customer with their inquiry',
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
    systemPrompt: 'You are a helpful customer support agent.',
    instructions: 'Help the customer with their inquiry',
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
```

## License

MIT