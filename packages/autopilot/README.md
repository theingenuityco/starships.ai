# @starships/autopilot

Workflow execution engine and agent development framework for starships.ai.

## Overview

Autopilot provides two complementary systems:

1. **Workflow Execution Engine** - Execute complex DAG-based workflows with conditional routing
2. **Agent Development Framework** - Build and manage AI agents with lifecycle management

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

## Agent Framework

### Features

- **Clean Agent Abstraction** - Simple base class with lifecycle hooks
- **Fluent Builder API** - Easy agent creation with validation
- **Pluggable Execution** - Custom handlers for different agent types
- **Type-safe Interfaces** - Full TypeScript support
- **Zero Dependencies** - Pure framework with no external requirements

### Quick Start - Agents

```typescript
import { AgentBuilder, type ExecutionHandler } from '@starships/autopilot';

// Create a custom execution handler
class ChatExecutionHandler implements ExecutionHandler {
  async handle(request: AgentRequest, agent: Agent): Promise<AgentResponse> {
    // Your implementation here - call LLM, access memory, etc.
    return {
      content: `Hello! I'm ${agent.name}. You said: "${request.message}"`,
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId
    };
  }
}

// Build an agent
const agent = new AgentBuilder()
  .setName('Customer Support Agent')
  .setDescription('Helps customers with inquiries')
  .setHandler(new ChatExecutionHandler())
  .build();

// Initialize and use the agent
await agent.onInitialize({ userId: 'user-123' });

const response = await agent.execute({
  message: 'Hello, I need help',
  sessionId: 'session-456'
});

console.log(response.content);
```

### Agent Lifecycle

Every agent follows a simple lifecycle:

1. **Create** - Build agent with configuration using AgentBuilder
2. **Initialize** - Setup with context (user, services, etc.)
3. **Execute** - Process requests and return responses  
4. **Destroy** - Cleanup when done

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
        model: 'gpt-4',
        provider: 'openai',
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
      parameters: { agentId: 'support-001', instructions: 'Help the user' }
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

// 3. Execute workflow with all node types
const registry = new Registry();
registry.register(new StartHandler());
registry.register(new EndHandler());
registry.register(new HttpRequestHandler());
registry.register(new LlmHandler());
registry.register(new AgentHandler()); // Can integrate with agent framework

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

Integrates with various Large Language Model providers by converting parameters to HTTP requests.

```typescript
{
  id: 'ai-response',
  type: 'llm',
  name: 'Generate AI Response',
  description: 'Create intelligent response using LLM',
  parameters: {
    model: 'gpt-4',
    provider: 'openai',
    prompt: 'Analyze this data and provide insights',
    systemMessage: 'You are an expert data analyst',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    timeout: 60000
  }
}
```

**Supported Providers:**
- `openai` - OpenAI GPT models
- `anthropic` - Anthropic Claude models
- `google` - Google Gemini models
- `local` - Local models (Ollama)
- `custom` - Custom provider endpoints

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

### Agent Framework

#### Agent (Abstract Base Class)
```typescript
abstract class Agent {
  abstract readonly id: string;
  abstract readonly name: string; 
  abstract readonly description: string;
  
  abstract onInitialize(context: AgentContext): Promise<void>;
  abstract onExecute(request: AgentRequest): Promise<AgentResponse>;
  abstract onDestroy(): Promise<void>;
  
  execute(request: AgentRequest): Promise<AgentResponse>; // Includes validation
}
```

#### AgentBuilder
```typescript
class AgentBuilder {
  setId(id: string): this;
  setName(name: string): this;
  setDescription(description: string): this;
  setHandler(handler: ExecutionHandler): this;
  build(): Agent;
  reset(): this;
}
```

#### Types
```typescript
interface AgentContext {
  userId: string;
  starshipId?: string;
  services?: Record<string, unknown>;
}

interface AgentRequest {
  message: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

interface AgentResponse {
  content: string;
  timestamp: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

interface ExecutionHandler {
  handle(request: AgentRequest, agent: Agent): Promise<AgentResponse>;
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