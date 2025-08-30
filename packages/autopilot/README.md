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
import { Engine, Registry, Validator, type Workflow } from '@starships/autopilot';

// Create workflow
const workflow: Workflow = {
  id: 'example-workflow',
  expeditionId: 'exp-1',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
    { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'end' }
  ],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString()
};

// Validate workflow
const validator = new Validator();
const validation = validator.validate(workflow);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Execute workflow
const registry = new Registry();
const engine = new Engine(registry);
const result = await engine.execute(workflow, {
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

## Node Types

Autopilot supports various node types for building complex workflows:

- **start/end** - Flow control nodes
- **agent** - AI agent task execution with embedded configuration
- **conditional** - Smart routing with JSONata expressions
- **user_prompt** - Interactive user input
- **output** - Result formatting and delivery
- **http_request** - HTTP API calls with authentication and retry support
- **llm** - Large Language Model interactions (OpenAI, Anthropic, Google, etc.)

## Integration Example

### Using Both Systems Together

```typescript
import { 
  // Workflow system
  Engine, Registry, StartHandler, EndHandler, AgentHandler,
  // Agent framework  
  AgentBuilder, type ExecutionHandler 
} from '@starships/autopilot';

// 1. Create agents using the framework
class ServerExecutionHandler implements ExecutionHandler {
  async handle(request: AgentRequest, agent: Agent): Promise<AgentResponse> {
    // Server implements actual agent logic
    return {
      content: `${agent.name} processed: ${request.message}`,
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId
    };
  }
}

const supportAgent = new AgentBuilder()
  .setId('support-001')
  .setName('Support Agent')
  .setDescription('Customer support specialist')
  .setHandler(new ServerExecutionHandler())
  .build();

await supportAgent.onInitialize({ userId: 'user-123' });

// 2. Create workflow that uses the agent
const workflow = {
  id: 'support-workflow',
  expeditionId: 'exp-1',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
    {
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
    },
    {
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
    },
    {
      id: 'agent-task',
      type: 'agent',
      name: 'Process Request',
      description: 'Handle user request',
      parameters: {
        name: 'Support Agent',
        model: 'anthropic/claude-3.5-sonnet',
        instructions: 'Help the user',
        systemPrompt: 'You are a helpful customer support agent.'
      }
    },
    { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'http-call' },
    { id: 'edge-2', from: 'http-call', to: 'llm-task' },
    { id: 'edge-3', from: 'llm-task', to: 'agent-task' },
    { id: 'edge-4', from: 'agent-task', to: 'end' }
  ],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString()
};

// Execute workflow with all node types
const registry = new Registry();
registry.register(new StartHandler());
registry.register(new EndHandler());
registry.register(new HttpRequestHandler());
registry.register(new LlmHandler());
registry.register(new AgentHandler()); // Handles embedded agent configuration

const engine = new Engine(registry);
const result = await engine.execute(workflow, { userId: 'user-123' });
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

## API Reference

### Workflow System

#### Engine
```typescript
const engine = new Engine(registry);
const result = await engine.execute(workflow, context);
```

#### Registry
```typescript
const registry = new Registry();
registry.register(new CustomHandler());
```

#### Validator
```typescript
const validator = new Validator();
const result = validator.validate(workflow);
```

### Agent Node Configuration

Agents are now embedded directly in workflow nodes with full configuration:

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
}
```

Example agent node:
```typescript
{
  id: 'support-agent',
  type: 'agent',
  name: 'Customer Support',
  description: 'Handles customer inquiries',
  parameters: {
    name: 'Support Agent',
    model: 'anthropic/claude-3.5-sonnet',
    systemPrompt: 'You are a helpful customer support agent.',
    temperature: 0.7,
    maxTokens: 500,
    instructions: 'Help the customer with their inquiry'
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