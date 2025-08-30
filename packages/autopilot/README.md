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
import { Workflow, Validator } from '@starships/autopilot';

// Create workflow using the builder pattern
const workflow = new Workflow('example-workflow')
  .addNode({ type: 'start', name: 'Start', description: 'Begin', parameters: {} })
  .addNode({ type: 'end', name: 'End', description: 'Complete', parameters: {} })
  .addEdge('start', 'end');

// Validate workflow
const validation = workflow.validate();

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Execute workflow - engine with all handlers is created internally
const result = await workflow.execute({
  userId: 'user-1'
});

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

## Node Types

Autopilot supports various node types for building complex workflows:

- **start/end** - Flow control nodes
- **agent** - AI agent task execution with embedded configuration
- **conditional** - Smart routing with JSONata expressions
- **user_prompt** - Interactive user input
- **output** - Result formatting and delivery
- **http_request** - HTTP API calls with authentication and retry support
- **llm** - Large Language Model interactions (OpenAI, Anthropic, Google, etc.)
- **workflow** - Execute embedded workflow blueprints

## Integration Example

### Complete Workflow Example

```typescript
import { Workflow } from '@starships/autopilot';

// Create workflow with multiple node types - all handlers are automatically available
const workflow = new Workflow('support-workflow')
  .addNode({
    id: 'start',
    type: 'start',
    name: 'Start',
    description: 'Begin',
    parameters: {}
  })
  .addNode({
    id: 'http-call',
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
    id: 'llm-task',
    type: 'llm',
    name: 'Generate Response',
    description: 'Create personalized response using AI',
    parameters: {
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'Generate a helpful response for the user based on their data',
      temperature: 0.7,
      maxTokens: 500,
      systemMessage: 'You are a helpful customer support assistant.'
    }
  })
  .addNode({
    id: 'agent-task',
    type: 'agent',
    name: 'Process Request',
    description: 'Handle user request',
    parameters: {
      name: 'Support Agent',
      model: 'anthropic/claude-3.5-sonnet',
      instructions: 'Help the user',
      systemPrompt: 'You are a helpful customer support agent.',
      blueprint: {
        id: 'agent-workflow',
        nodes: [
          { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
          { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
        ],
        edges: [{ id: 'edge-1', from: 'start', to: 'end' }],
        metadata: {}
      }
    }
  })
  .addNode({
    id: 'end',
    type: 'end',
    name: 'End',
    description: 'Complete',
    parameters: {}
  })
  .addEdge('start', 'http-call')
  .addEdge('http-call', 'llm-task')
  .addEdge('llm-task', 'agent-task')
  .addEdge('agent-task', 'end');

// Execute workflow - engine with all node handlers is managed internally
const result = await workflow.execute({ userId: 'user-123' });
```

## New Node Types

### HTTP Request Node

Makes HTTP API calls with comprehensive support for authentication, retries, and response handling.

```typescript
{
  id: 'api-call',
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

Integrates with AI models using OpenRouter's unified API, providing access to 200+ models from various providers including OpenAI, Anthropic, Google, Meta, and more.

```typescript
{
  id: 'ai-response',
  type: 'llm',
  name: 'Generate AI Response',
  description: 'Create intelligent response using LLM via OpenRouter',
  parameters: {
    model: 'anthropic/claude-3.5-sonnet',
    prompt: 'Analyze this data and provide insights',
    systemMessage: 'You are an expert data analyst',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    timeout: 60000
  }
}
```

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
  id: 'sub-workflow',
  type: 'workflow',
  name: 'Data Processing Pipeline',
  description: 'Execute data processing workflow',
  parameters: {
    blueprint: {
      id: 'data-processing',
      nodes: [
        { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
        {
          id: 'fetch-data',
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
          id: 'process-data',
          type: 'llm',
          name: 'Process Data',
          description: 'Transform data using AI',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Process this data: {{data}}'
          }
        },
        { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
      ],
      edges: [
        { id: 'edge-1', from: 'start', to: 'fetch-data' },
        { id: 'edge-2', from: 'fetch-data', to: 'process-data' },
        { id: 'edge-3', from: 'process-data', to: 'end' }
      ],
      metadata: {}
    },
    workflowContext: {
      token: 'your-api-token',
      data: 'input-data'
    },
    timeout: 120000
  }
}
```

**Key Features:**
- **Blueprint Storage**: Store and execute complete workflow definitions
- **Context Passing**: Pass custom context to embedded workflows
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
const workflow = new Workflow('my-workflow');
const result = await workflow.execute(context);
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

Agents now execute embedded workflows, providing powerful multi-step execution capabilities:

```typescript
interface AgentNodeParameters {
  // Core agent identity
  name: string;
  description?: string;
  
  // LLM configuration
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Execution parameters
  instructions?: string;
  timeout?: number;
  
  // Embedded workflow execution (required)
  workflow: Workflow;
  workflowContext?: Record<string, unknown>;
}
```

Example agent node with embedded workflow:
```typescript
{
  id: 'support-agent',
  type: 'agent',
  name: 'Customer Support',
  description: 'Handles customer inquiries with multi-step workflow',
  parameters: {
    name: 'Support Agent',
    model: 'anthropic/claude-3.5-sonnet',
    systemPrompt: 'You are a helpful customer support agent.',
    temperature: 0.7,
    maxTokens: 500,
    instructions: 'Help the customer with their inquiry',
    // Embedded workflow that the agent will execute
    blueprint: {
      id: 'support-workflow',
      nodes: [
        { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
        {
          id: 'fetch-data',
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
          id: 'analyze',
          type: 'llm',
          name: 'Analyze Issue',
          description: 'Understand customer problem',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Analyze customer data and issue: {{customerIssue}}',
            systemMessage: 'You are a customer support analyst.'
          }
        },
        { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
      ],
      edges: [
        { id: 'edge-1', from: 'start', to: 'fetch-data' },
        { id: 'edge-2', from: 'fetch-data', to: 'analyze' },
        { id: 'edge-3', from: 'analyze', to: 'end' }
      ],
      metadata: {}
    },
    // Context passed to the embedded workflow
    workflowContext: {
      customerId: '12345',
      apiToken: 'your-api-token',
      customerIssue: 'Login problems'
    }
  }
}
```

#### Agent Workflow Execution Features

- **Embedded Workflows**: Each agent node contains a complete workflow definition
- **Context Merging**: Agent parameters and context are automatically merged with workflow execution context
- **Result Aggregation**: Workflow results are collected and returned as part of agent output
- **Comprehensive Validation**: Embedded workflows are validated for structure, nodes, and dependencies
- **Error Handling**: Robust error handling with detailed feedback on workflow execution failures

#### Agent Execution Flow

1. Agent receives parameters with embedded workflow
2. Agent context is merged with workflow context
3. Embedded workflow is executed using the workflow engine
4. Results from all workflow nodes are collected
5. Final output includes both agent information and workflow results

Example execution result:
```typescript
{
  nodeId: 'support-agent',
  success: true,
  data: {
    agentName: 'Support Agent',
    model: 'anthropic/claude-3.5-sonnet',
    workflowId: 'support-workflow',
    workflowStatus: 'completed',
    workflowResults: [
      { /* start node result */ },
      { /* http_request result with customer data */ },
      { /* llm analysis result */ }
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