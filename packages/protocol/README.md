# @starships/protocol

Comprehensive TypeScript interfaces and type definitions for the Starships mission control platform. Provides type safety for missions, workflows, expeditions, Socket.IO events, MCP integration, and all platform features.

## 🚀 Features

- **Mission Types**: Complete mission orchestration with phase management and clarity assessment
- **Workflow DSL**: Full workflow definition language with execution state types
- **Socket.IO Events**: Real-time communication types for expeditions, missions, and vision refinement
- **MCP Integration**: Model Context Protocol types for tool integration and connector management
- **Expedition System**: Multi-agent expedition coordination types (stubbed for compilation)
- **Vision Refinement**: AI-powered vision improvement with quality metrics
- **Stripe Integration**: Payment and subscription management types
- **Error Handling**: Standardized error classes with HTTP status mapping
- **Agent Marketplace**: Enhanced agent types with ratings, categories, and analytics

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build
```

## 🏗️ Type Definitions

### Mission Orchestration Types

#### Mission Management
```typescript
interface Mission {
  id: string;
  title: string;
  objective: string;
  starshipId: string;
  phase: 'init' | 'welcome' | 'analysis' | 'plan' | 'converse';
  status: 'active' | 'completed' | 'paused' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

interface MissionMessage {
  id: string;
  missionId: string;
  content: string;
  role: 'user' | 'orchestrator' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface MissionClarity {
  id: string;
  missionId: string;
  clarity: number;      // 0-1 scale
  specificity: number;
  feasibility: number;
  measurability: number;
  timebound: number;
  overallScore: number;
  suggestions?: string[];
}
```

#### Starship Management
```typescript
interface Starship {
  id: string;
  name: string;
  slug: string;
  class: 'scout' | 'cruiser' | 'draught';
  ownerId: string;
  maxActiveExpeditions: number;
  maxAgents: number;
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled';
  stripeCustomerId?: string;
  vision?: Vision;
  createdAt: Date;
  updatedAt: Date;
}
```

### Workflow DSL Types

#### Workflow Definition
```typescript
interface WorkflowDSL {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
    expeditionId?: string;
  };
}

interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'agent' | 'conditional' | 'user_prompt' | 'output';
  data: WorkflowNodeData;
  position?: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

interface WorkflowExecutionContext {
  workflowId: string;
  expeditionId?: string;
  userId: string;
  starshipId: string;
  variables: Record<string, any>;
  services: {
    agentService?: any;
    missionService?: any;
    socketService?: any;
  };
}

interface WorkflowRuntimeState {
  id: string;
  workflowId: string;
  currentNode: string;
  state: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  history: WorkflowExecutionStep[];
}
```

### Enhanced Agent Types

```typescript
interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  starshipId: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  authorId: string;
  rating: number;
  usageCount: number;
  deploymentSettings?: {
    maxConcurrentTasks?: number;
    timeoutMs?: number;
    retryAttempts?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  systemPrompt: string;
  model: string;
  isPublic: boolean;
  authorId: string;
  usageCount: number;
  rating: number;
}

interface AgentAnalytics {
  agentId: string;
  totalInvocations: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  last30DaysUsage: number;
  ratings: {
    average: number;
    total: number;
    distribution: Record<number, number>;
  };
}
```

### Vision Refinement Types

#### Vision Management
```typescript
interface Vision {
  id: string;
  starshipId: string;
  statement: string;
  clarity: number;
  specificity: number;
  actionability: number;
  inspirational: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

interface VisionMetrics {
  clarity: number;
  specificity: number;
  actionability: number;
  inspirational: number;
  measurability: number;
  confidence: number;
  overallScore: number;
}

interface VisionRefinementProposal {
  type: 'clarity' | 'specificity' | 'actionability' | 'inspirational' | 'measurability';
  currentScore: number;
  suggestion: string;
  improvedVersion: string;
  confidenceScore: number;
  reasoning: string;
}

interface VisionRefinementSession {
  id: string;
  visionId: string;
  userId: string;
  proposals: VisionRefinementProposal[];
  acceptedProposals: string[];
  status: 'active' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}
```

### MCP Integration Types

#### MCP Server Management
```typescript
interface MCPServerOption {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  dockerImage: string;
  version: string;
  requiredApiKeys: string[];
  optionalApiKeys: string[];
  tools: MCPTool[];
  supportedPlatforms: string[];
  documentation?: string;
}

interface MCPServerConnector {
  id: string;
  mcpServerId: string;
  starshipId: string;
  dockerStatus: 'pending' | 'building' | 'running' | 'stopped' | 'error';
  httpBridgeEnabled: boolean;
  httpBridgeUrl?: string;
  port?: number;
  environmentVariables: Record<string, string>;
  lastHealthCheck?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  category?: string;
  examples?: MCPToolExample[];
}

interface NativeToolApiKey {
  id: string;
  starshipId: string;
  tool: string;
  encryptedKey: string;
  isConfigured: boolean;
  lastUsed?: Date;
}
```

### Socket.IO Event Types

#### Real-time Communication
```typescript
// Mission events
interface MissionChatEvent {
  missionId: string;
  message: MissionMessage;
  timestamp: Date;
}

interface MissionPhaseUpdateEvent {
  missionId: string;
  phase: Mission['phase'];
  timestamp: Date;
}

// Expedition events (stubbed)
interface ExpeditionProgressEvent {
  expeditionId: string;
  phase: 'plan' | 'workflow' | 'execute' | 'review';
  progress: number;
  message?: string;
  timestamp: Date;
}

interface ExpeditionActivityEvent {
  expeditionId: string;
  agentId: string;
  activity: string;
  timestamp: Date;
}

// Vision refinement events
interface VisionRefinementEvent {
  visionId: string;
  sessionId: string;
  proposals: VisionRefinementProposal[];
  timestamp: Date;
}

// Agent communication events
interface AgentCommunicationEvent {
  expeditionId: string;
  fromAgentId: string;
  toAgentId?: string;
  message: string;
  messageType: 'status' | 'request' | 'response' | 'broadcast';
  timestamp: Date;
}

// Connection and presence
interface UserJoinedEvent {
  userId: string;
  starshipId: string;
  timestamp: Date;
}

interface TypingIndicatorEvent {
  userId: string;
  location: string; // missionId, expeditionId, etc.
  isTyping: boolean;
}
```

### Expedition Types (Stubbed)

#### Expedition Coordination
```typescript
// Note: Expedition system is intentionally stubbed for development focus
interface ExpeditionStub {
  id: string;
  title: string;
  objective: string;
  starshipId: string;
  selectedAgents: string[];
  phase: 'plan' | 'workflow' | 'execute' | 'review';
  status: 'planning' | 'active' | 'completed' | 'failed';
  approvalRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ExpeditionTaskStub {
  id: string;
  expeditionId: string;
  title: string;
  description: string;
  assignedAgentId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
  result?: any;
}

interface ExpeditionMessageStub {
  id: string;
  expeditionId: string;
  agentId?: string;
  content: string;
  role: 'user' | 'agent' | 'first_officer' | 'system';
  timestamp: Date;
}
```

## 🔧 Usage

### In Server Package
```typescript
import type { 
  Mission, 
  MissionMessage, 
  Starship, 
  VisionRefinementProposal 
} from '@starships/protocol';

// Mission orchestration
app.post('/missions', async (req: Request, res: Response) => {
  const mission: Mission = await missionService.create(req.body);
  res.json(mission);
});

// Vision refinement
app.put('/starships/:id/vision', async (req: Request, res: Response) => {
  const proposals: VisionRefinementProposal[] = await visionService.refine(
    req.params.id, 
    req.body.statement
  );
  res.json({ proposals });
});
```

### In Agent Engine
```typescript
import type { 
  ExpeditionStub,
  WorkflowDSL,
  WorkflowExecutionContext,
  MCPTool,
  Agent
} from '@starships/protocol';

// First Officer expedition orchestration
export class FirstOfficerAgent {
  async executeExpedition(
    expedition: ExpeditionStub,
    context: WorkflowExecutionContext
  ): Promise<ExpeditionResult> {
    // Implementation using shared types
  }

  async executeWorkflow(
    workflow: WorkflowDSL,
    context: WorkflowExecutionContext
  ): Promise<WorkflowResult> {
    // Workflow execution implementation
  }
}
```

### In Client Package
```typescript
import type { 
  Mission, 
  MissionMessage, 
  VisionRefinementEvent,
  ExpeditionProgressEvent 
} from '@starships/protocol';
import { io, Socket } from 'socket.io-client';

// Mission chat interface
const sendMissionMessage = async (missionId: string, content: string): Promise<MissionMessage> => {
  const response = await fetch(`/api/missions/${missionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, role: 'user' })
  });
  
  return response.json() as MissionMessage;
};

// Real-time Socket.IO integration
const socket: Socket = io();

socket.on('mission:message', (event: MissionChatEvent) => {
  console.log('New mission message:', event.message);
});

socket.on('vision:refinement', (event: VisionRefinementEvent) => {
  console.log('Vision refinement proposals:', event.proposals);
});

socket.on('expedition:progress', (event: ExpeditionProgressEvent) => {
  console.log('Expedition progress:', event.progress);
});
```

## 📊 Type Validation

### Error Handling Types

```typescript
// Standardized error classes
export enum ErrorType {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  DATABASE = 'database',
  NETWORK = 'network',
  BUSINESS_LOGIC = 'business_logic'
}

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  code?: string;
  statusCode: number;
  context?: Record<string, any>;
  timestamp: Date;
}

export class StarshipsError extends Error {
  readonly type: ErrorType;
  readonly statusCode: number;
  readonly code?: string;
  readonly context?: Record<string, any>;
  readonly timestamp: Date;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.type = details.type;
    this.statusCode = details.statusCode;
    this.code = details.code;
    this.context = details.context;
    this.timestamp = details.timestamp;
  }
}

// Runtime type checking
export function isMission(obj: any): obj is Mission {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.objective === 'string' &&
    typeof obj.starshipId === 'string'
  );
}

export function isWorkflowDSL(obj: any): obj is WorkflowDSL {
  return (
    typeof obj === 'object' &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
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

### API Endpoint Contracts

#### Mission Management Endpoints
```typescript
// POST /missions
type CreateMissionEndpoint = {
  method: 'POST';
  path: '/missions';
  request: Partial<Mission>;
  response: Mission;
};

// GET /missions/:id
type GetMissionEndpoint = {
  method: 'GET';
  path: '/missions/:id';
  response: Mission;
};

// POST /missions/:id/chat
type MissionChatEndpoint = {
  method: 'POST';
  path: '/missions/:id/chat';
  request: { message: string; role: 'user' | 'orchestrator' };
  response: MissionMessage;
};
```

#### Enhanced Agent Endpoints
```typescript
// GET /agents
type ListAgentsEndpoint = {
  method: 'GET';
  path: '/agents';
  query?: {
    category?: string;
    tags?: string;
    public?: boolean;
    page?: number;
    limit?: number;
  };
  response: {
    agents: Agent[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

// GET /agents/:id/analytics
type AgentAnalyticsEndpoint = {
  method: 'GET';
  path: '/agents/:id/analytics';
  response: AgentAnalytics;
};

// PUT /starships/:id/vision
type VisionRefinementEndpoint = {
  method: 'PUT';
  path: '/starships/:id/vision';
  request: { statement: string };
  response: {
    vision: Vision;
    proposals: VisionRefinementProposal[];
  };
};
```

### Stripe Integration Types

```typescript
interface StripeSubscription {
  id: string;
  starshipId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  plan: 'scout' | 'cruiser' | 'draught';
  billingCycle: 'monthly' | 'yearly';
  createdAt: Date;
  updatedAt: Date;
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
  idempotencyKey?: string;
}

interface PaymentStatus {
  starshipId: string;
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled';
  currentPlan: 'scout' | 'cruiser' | 'draught';
  billingPortalUrl?: string;
  nextBillingDate?: Date;
  paymentMethod?: {
    type: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
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
// Update types for entities
type MissionUpdate = Partial<Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>>;
type StarshipUpdate = Partial<Omit<Starship, 'id' | 'createdAt' | 'updatedAt'>>;
type AgentUpdate = Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>>;
type VisionUpdate = Partial<Omit<Vision, 'id' | 'starshipId' | 'createdAt' | 'updatedAt'>>;

// Workflow types
type WorkflowNodeType = WorkflowNode['type'];
type WorkflowStatus = WorkflowRuntimeState['status'];
type MissionPhase = Mission['phase'];
type StarshipClass = Starship['class'];

// Socket event types
type SocketEventType = 
  | 'mission:message'
  | 'mission:phase_update'
  | 'expedition:progress'
  | 'expedition:activity'
  | 'vision:refinement'
  | 'agent:communication'
  | 'user:joined'
  | 'typing:indicator';

// MCP types
type MCPConnectorStatus = MCPServerConnector['dockerStatus'];
type NativeToolType = 'firecrawl' | 'notion' | 'brave_search' | 'github';

// Error union types
type ValidationError = StarshipsError & { type: ErrorType.VALIDATION };
type AuthenticationError = StarshipsError & { type: ErrorType.AUTHENTICATION };
type NotFoundError = StarshipsError & { type: ErrorType.NOT_FOUND };

// Branded ID types for better type safety
type MissionId = string & { __brand: 'MissionId' };
type StarshipId = string & { __brand: 'StarshipId' };
type AgentId = string & { __brand: 'AgentId' };
type UserId = string & { __brand: 'UserId' };
type ExpeditionId = string & { __brand: 'ExpeditionId' };
type WorkflowId = string & { __brand: 'WorkflowId' };
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

### Mock Types for Testing
```typescript
export const mockMission: Mission = {
  id: 'mission-123',
  title: 'Test Mission',
  objective: 'Test objective for development',
  starshipId: 'starship-456',
  phase: 'init',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockStarship: Starship = {
  id: 'starship-123',
  name: 'Test Starship',
  slug: 'test-starship',
  class: 'cruiser',
  ownerId: 'user-456',
  maxActiveExpeditions: 5,
  maxAgents: 6,
  subscriptionStatus: 'trial',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockAgent: Agent = {
  id: 'agent-123',
  name: 'Test Research Agent',
  model: 'gpt-4',
  systemPrompt: 'You are a helpful research assistant',
  starshipId: 'starship-456',
  category: 'research',
  tags: ['analysis', 'research'],
  isPublic: false,
  authorId: 'user-789',
  rating: 4.5,
  usageCount: 150,
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockWorkflowDSL: WorkflowDSL = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'research', type: 'agent', data: { agentId: 'research-agent' } },
    { id: 'end', type: 'end', data: {} }
  ],
  edges: [
    { id: 'edge1', from: 'start', to: 'research' },
    { id: 'edge2', from: 'research', to: 'end' }
  ]
};

export const mockVision: Vision = {
  id: 'vision-123',
  starshipId: 'starship-456',
  statement: 'To revolutionize AI-powered productivity',
  clarity: 0.8,
  specificity: 0.7,
  actionability: 0.9,
  inspirational: 0.85,
  confidence: 0.82,
  createdAt: new Date(),
  updatedAt: new Date()
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