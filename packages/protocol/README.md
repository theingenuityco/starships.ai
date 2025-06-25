# @starships/protocol

Shared TypeScript interfaces and API contracts for the Starships platform. Provides type safety and consistency across all packages in the monorepo.

## 🚀 Features

- **Type Safety**: Comprehensive TypeScript interfaces
- **API Contracts**: Standardized request/response formats
- **Cross-Package Consistency**: Shared types across all services
- **Zero Dependencies**: Pure TypeScript definitions
- **Extensible**: Easy to extend with new types and interfaces

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build
```

## 🏗️ Type Definitions

### Core API Types

#### Chat Interface
```typescript
interface ChatRequest {
  agent_id: string;       // Agent identifier
  user_id: string;        // User identifier
  channel_id?: string;    // Optional channel context
  message: string;        // User message content
  stream?: boolean;       // Enable streaming response
}

interface ChatResponse {
  reply: string;          // Agent's response
  usage?: UsageStats;     // Token usage statistics
}
```

#### Usage Statistics
```typescript
interface UsageStats {
  prompt_tokens: number;      // Input tokens consumed
  completion_tokens: number;  // Output tokens generated
}
```

### Agent Configuration

```typescript
interface AgentConfig {
  id: string;                        // Unique agent identifier
  name: string;                      // Display name
  model: string;                     // LLM model identifier
  provider?: 'openai' | 'anthropic'; // LLM provider
  systemPrompt?: string;             // System instructions
}
```

### Memory System Types

#### Memory Entries
```typescript
interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

interface EnhancedMemoryEntry extends MemoryEntry {
  embedding?: number[];    // Vector embedding
  importance?: number;     // Relevance score (0-1)
  summary?: string;        // Content summary
}
```

#### Memory Search
```typescript
interface MemorySearchResult {
  entries: EnhancedMemoryEntry[];
  relevanceScores: number[];
}

type SessionKey = string;  // Format: "agent_id:user_id:channel_id"
```

### LLM Provider Interface

#### Provider Contract
```typescript
interface LLMProvider {
  complete(
    prompt: LLMChatPrompt, 
    opts?: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResult>;
}
```

#### LLM Types
```typescript
interface LLMChatPrompt {
  messages: Array<{
    role: "system" | "assistant" | "user";
    content: string;
  }>;
}

interface LLMResult {
  reply: string;
  usage?: UsageStats;
}
```

## 🔧 Usage

### In Server Package
```typescript
import type { ChatRequest, ChatResponse } from '@starships/protocol';

app.post('/v1/chat', async (req: Request, res: Response) => {
  const chatRequest: ChatRequest = req.body;
  const response: ChatResponse = await processChat(chatRequest);
  res.json(response);
});
```

### In Agent Engine
```typescript
import type { 
  ChatRequest, 
  ChatResponse, 
  MemoryEntry,
  LLMProvider 
} from '@starships/protocol';

export async function chat(
  req: ChatRequest, 
  provider: LLMProvider
): Promise<ChatResponse> {
  // Implementation using shared types
}
```

### In Client Package
```typescript
import type { ChatRequest, ChatResponse } from '@starships/protocol';

const sendMessage = async (message: string): Promise<ChatResponse> => {
  const request: ChatRequest = {
    agent_id: 'agent-123',
    user_id: 'user-456',
    message
  };
  
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  return response.json() as ChatResponse;
};
```

## 📊 Type Validation

### Runtime Type Checking
```typescript
// Type guards for runtime validation
export function isChatRequest(obj: any): obj is ChatRequest {
  return (
    typeof obj === 'object' &&
    typeof obj.agent_id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.message === 'string'
  );
}

export function isChatResponse(obj: any): obj is ChatResponse {
  return (
    typeof obj === 'object' &&
    typeof obj.reply === 'string'
  );
}
```

### Schema Validation (Optional)
```typescript
import { z } from 'zod';

export const ChatRequestSchema = z.object({
  agent_id: z.string(),
  user_id: z.string(),
  channel_id: z.string().optional(),
  message: z.string(),
  stream: z.boolean().optional()
});

export const ChatResponseSchema = z.object({
  reply: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number()
  }).optional()
});
```

## 🔀 API Contracts

### RESTful Endpoints

#### Chat Endpoints
```typescript
// POST /v1/chat
type ChatEndpoint = {
  method: 'POST';
  path: '/v1/chat';
  request: ChatRequest;
  response: ChatResponse;
};

// DELETE /v1/chat/:sessionKey/memory
type ClearMemoryEndpoint = {
  method: 'DELETE';
  path: '/v1/chat/:sessionKey/memory';
  response: { success: boolean };
};
```

#### Agent Endpoints
```typescript
// GET /v1/agents
type ListAgentsEndpoint = {
  method: 'GET';
  path: '/v1/agents';
  response: AgentConfig[];
};

// GET /v1/agents/:id
type GetAgentEndpoint = {
  method: 'GET';
  path: '/v1/agents/:id';
  response: AgentConfig;
};
```

### WebSocket Events
```typescript
interface WebSocketMessage {
  type: 'chat_message' | 'agent_typing' | 'error';
  payload: any;
  timestamp: number;
}

interface ChatStreamEvent extends WebSocketMessage {
  type: 'chat_message';
  payload: {
    sessionKey: string;
    delta: string;        // Incremental content
    done: boolean;        // Stream completion flag
  };
}
```

## 🔧 Extension Patterns

### Adding New Types
```typescript
// New feature: Agent capabilities
interface AgentCapability {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

// Extend existing interface
interface ExtendedAgentConfig extends AgentConfig {
  capabilities?: AgentCapability[];
  avatar?: string;
  tags?: string[];
}
```

### Custom Provider Types
```typescript
// New LLM provider
interface CustomLLMProvider extends LLMProvider {
  // Provider-specific methods
  getModelInfo(): Promise<ModelInfo>;
  listAvailableModels(): Promise<string[]>;
}

interface ModelInfo {
  name: string;
  version: string;
  maxTokens: number;
  supportedFeatures: string[];
}
```

## 📚 Type Utilities

### Utility Types
```typescript
// Partial update types
type PartialChatRequest = Partial<ChatRequest>;
type AgentUpdate = Partial<Omit<AgentConfig, 'id'>>;

// Key extraction
type ChatRequestKeys = keyof ChatRequest;
type RequiredChatFields = Required<Pick<ChatRequest, 'agent_id' | 'user_id' | 'message'>>;

// Union types
type MessageRole = MemoryEntry['role'];
type SupportedProvider = NonNullable<AgentConfig['provider']>;
```

### Type Branding
```typescript
// Branded types for better type safety
type AgentId = string & { __brand: 'AgentId' };
type UserId = string & { __brand: 'UserId' };
type ChannelId = string & { __brand: 'ChannelId' };

// Type constructors
export const createAgentId = (id: string): AgentId => id as AgentId;
export const createUserId = (id: string): UserId => id as UserId;
export const createChannelId = (id: string): ChannelId => id as ChannelId;
```

## 🧪 Testing Support

### Mock Types
```typescript
export const mockChatRequest: ChatRequest = {
  agent_id: 'test-agent',
  user_id: 'test-user',
  message: 'Hello, world!'
};

export const mockChatResponse: ChatResponse = {
  reply: 'Hello! How can I help you?',
  usage: {
    prompt_tokens: 10,
    completion_tokens: 8
  }
};

export const mockAgentConfig: AgentConfig = {
  id: 'test-agent',
  name: 'Test Agent',
  model: 'gpt-3.5-turbo',
  provider: 'openai',
  systemPrompt: 'You are a helpful test assistant.'
};
```

### Test Utilities
```typescript
export function createMockMemoryEntry(
  role: MemoryEntry['role'] = 'user',
  content: string = 'Test message'
): MemoryEntry {
  return {
    role,
    content,
    timestamp: Date.now()
  };
}

export function createMockSessionKey(
  agentId: string = 'agent-1',
  userId: string = 'user-1',
  channelId?: string
): SessionKey {
  return `${agentId}:${userId}${channelId ? ':' + channelId : ''}`;
}
```

## 🔍 Best Practices

### Type Safety
1. **Use strict TypeScript**: Enable strict mode for all type checking
2. **Avoid `any`**: Use unknown or proper typing instead
3. **Leverage type guards**: Validate runtime data with type predicates
4. **Brand types**: Use branded types for domain-specific identifiers

### API Design
1. **Consistent naming**: Use snake_case for API, camelCase for TypeScript
2. **Optional fields**: Mark optional fields clearly in interfaces
3. **Extensible types**: Design for future extension without breaking changes
4. **Clear documentation**: Document complex types and their usage

### Versioning
1. **Semantic versioning**: Follow semver for breaking changes
2. **Deprecation warnings**: Mark deprecated types with JSDoc
3. **Migration guides**: Provide upgrade paths for breaking changes
4. **Backward compatibility**: Maintain compatibility when possible

## 📄 License

Private package - Part of the Starships AI platform. 