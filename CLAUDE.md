# CLAUDE.md - AI Assistant Guide for Starships.ai

> **Last Updated**: 2025-11-14
> **Purpose**: Comprehensive guide for AI assistants working on the Starships.ai codebase

---

## Quick Reference

### Essential Commands
```bash
# Development
pnpm dev              # Start all services (Client:3000, Server:4000, Docs:3001)
pnpm build            # Build all packages
pnpm type-check       # TypeScript validation
pnpm lint             # ESLint check
pnpm test             # Run all tests

# Database
pnpm run postgres:install   # Start PostgreSQL 18 container
pnpm run postgres:shell     # Access psql shell
pnpm run postgres:backup    # Create backup
```

### Project Structure at a Glance
```
starships.ai/
├── packages/
│   ├── autopilot/          # Workflow engine (DAG execution)
│   ├── autopilot-runner/   # gRPC runner service
│   ├── client/             # Next.js 15 frontend (Port 3000)
│   ├── server/             # Express 5 API (Port 4000)
│   ├── models/             # PostgreSQL entities & repositories
│   ├── protocol/           # Shared TypeScript types
│   ├── env/                # Environment configuration
│   ├── errors/             # Error handling system
│   ├── docs/               # Documentation site
│   └── reverse-proxy/      # Traffic routing
├── docs/                   # Architecture documentation
├── k8s/                    # Kubernetes manifests
└── infra/                  # Infrastructure as code
```

### Technology Stack
- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Express 5, PostgreSQL 18, JWT auth, SSE streaming
- **LLM**: OpenAI SDK, Anthropic SDK, OpenRouter
- **Workflow**: Custom Autopilot DAG engine
- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.8 (strict mode)

---

## Repository Overview

**Starships.ai** is a production-ready platform that turns goals into shipped work with AI agents. Users capture goals in plain language → Starships proposes a plan and builds a DAG workflow (Autopilot) → Agents execute with streaming updates.

**Target Users**: Product, operations, and engineering teams

**Current Version**: 3.14.3

---

## Critical: 6-Layer Architecture Pattern

> **⚠️ THIS IS THE MOST IMPORTANT PATTERN IN THE CODEBASE**
> All features MUST follow this architecture. See: `/home/user/starships.ai/docs/layered-architecture-patterns.md`

### Layer 1: Domain (Protocol Package)
- **Location**: `packages/protocol/src/domains/`
- **Purpose**: Pure TypeScript interfaces and types (contracts only)
- **Pattern**: No implementation, just type definitions
- **Example**: `ConversationModel`, `AgentModel`, `MessageModel`

### Layer 2: Entity (Models Package)
- **Location**: `packages/models/src/entities/`
- **Purpose**: Data validation and transformation
- **Pattern**: `class-validator` + `class-transformer` decorators
- **Methods**: `static deserialize()`, `serialize()`, `validate()`
- **Responsibility**: Convert between snake_case (DB) and camelCase (app)

### Layer 3: Repository (Models Package)
- **Location**: `packages/models/src/repositories/`
- **Purpose**: Data access abstraction (SIMPLE operations only)
- **Pattern**: Extends `BaseRepository`, raw PostgreSQL queries
- **Scope**:
  - ✅ CRUD operations
  - ✅ Basic queries and filters
  - ✅ Entity validation/transformation
  - ❌ Business logic
  - ❌ Multi-step operations
  - ❌ Cross-entity calculations

### Layer 4: Service (Server Package)
- **Location**: `packages/server/src/services/`
- **Purpose**: Business logic orchestration (COMPLEX operations)
- **Pattern**: Multi-repository coordination
- **Scope**:
  - ✅ Multi-step business operations
  - ✅ Business rule enforcement
  - ✅ Complex calculations
  - ✅ Cross-entity coordination
  - ✅ Activity tracking and logging

### Layer 5: API Routes (Server Package)
- **Location**: `packages/server/src/routes/`
- **Purpose**: HTTP endpoint exposure
- **Pattern**: Express routers + Zod validation + middleware
- **Features**: Authentication, validation, error handling, SSE streaming

### Layer 6: Client Hooks (Client Package)
- **Location**: `packages/client/src/hooks/`
- **Purpose**: React data fetching and caching
- **Pattern**: TanStack Query with optimistic updates
- **Features**: Cache management, background refetch, error handling

### Key Architectural Rules

1. **No Layer Jumping**: Routes MUST use Services, NOT Repositories directly
2. **Dependency Direction**: Always points inward (Client → Routes → Service → Repository → Entity → Domain)
3. **Data Transformation**: Each layer transforms data appropriately
4. **Error Propagation**: Errors bubble up with added context at each layer

### Example: Creating a New Feature

When adding a new "Task" feature:

```typescript
// 1. Domain (protocol/src/domains/task.ts)
export interface TaskModel {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
}

// 2. Entity (models/src/entities/TaskEntity.ts)
export class TaskEntity {
  @IsString() id!: string;
  @IsString() title!: string;
  @IsEnum(['pending', 'in_progress', 'completed']) status!: string;
  @IsDate() createdAt!: Date;

  static deserialize(data: any): TaskEntity { /* ... */ }
  serialize(): TaskModel { /* ... */ }
}

// 3. Repository (models/src/repositories/TaskRepository.ts)
export class TaskRepository extends BaseRepository<TaskEntity> {
  async createTask(data: CreateTaskData): Promise<TaskEntity> {
    // Simple CRUD only
  }

  async findTasksByStatus(status: string): Promise<TaskEntity[]> {
    // Basic queries only
  }
}

// 4. Service (server/src/services/TaskService.ts)
export class TaskService {
  constructor(
    private taskRepo: TaskRepository,
    private userRepo: UserRepository,
    private notificationService: NotificationService
  ) {}

  async completeTask(taskId: string, userId: string): Promise<TaskModel> {
    // Complex business logic:
    // 1. Validate user permissions
    // 2. Update task status
    // 3. Create notification
    // 4. Update user stats
  }
}

// 5. Route (server/src/routes/tasks.ts)
router.post('/tasks/:id/complete',
  authenticate,
  validate(completeTaskSchema),
  async (req, res) => {
    const task = await taskService.completeTask(req.params.id, req.user.id);
    res.json({ data: task });
  }
);

// 6. Client Hook (client/src/hooks/useTasks.ts)
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.completeTask(taskId),
    onMutate: async (taskId) => {
      // Optimistic update
    },
    onError: (err, vars, context) => {
      // Rollback
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    }
  });
}
```

---

## Monorepo Package Structure

### Core Packages

#### @starships/autopilot
- **Purpose**: Workflow execution engine and agent framework
- **Type**: Published library
- **Key Features**: DAG execution, LLM/HTTP/Tool/Conditional nodes, event streaming
- **Entry**: `packages/autopilot/src/index.ts`
- **Tests**: Comprehensive Jest tests in `src/tests/`

#### @starships/client
- **Purpose**: Next.js 15 frontend application
- **Port**: 3000
- **Tech**: App Router, React 19, Tailwind CSS, shadcn/ui
- **Key Libraries**: TanStack Query, React Flow, Monaco Editor, Tiptap, Three.js
- **Entry**: `packages/client/src/app/page.tsx`

#### @starships/server
- **Purpose**: Express 5 REST API with SSE streaming
- **Port**: 4000
- **Tech**: Express 5, PostgreSQL 18, JWT auth
- **Key Features**: REST endpoints, SSE streaming, background job processing
- **Entry**: `packages/server/src/index.ts`

#### @starships/models
- **Purpose**: Database layer (entities, repositories, migrations)
- **Tech**: PostgreSQL with node-postgres (pg)
- **Pattern**: Repository pattern (no ORM)
- **Key Directories**:
  - `src/entities/` - Entity classes with validation
  - `src/repositories/` - Data access layer
  - `src/migrations/` - SQL migrations
  - `src/seeders/` - Database seeders

#### @starships/protocol
- **Purpose**: Shared TypeScript types and domain contracts
- **Structure**:
  - `src/domains/` - Domain models (Agent, Conversation, Message, etc.)
  - `src/contracts/` - API contracts (api-response, errors, streaming)
- **Pattern**: Single source of truth for type definitions

#### @starships/autopilot-runner
- **Purpose**: gRPC service for executing Autopilot blueprints
- **Tech**: Buf Connect, protobuf
- **Features**: Local worker pool, remote execution

### Shared Infrastructure

#### @starships/env
- **Purpose**: Environment variable management with type safety
- **Tech**: dotenv, dotenv-expand
- **Pattern**: Centralized configuration

#### @starships/errors
- **Purpose**: Error handling system
- **Features**: Custom error classes, error codes, serialization

---

## Database Architecture

### Technology
- **RDBMS**: PostgreSQL 18
- **Driver**: node-postgres (pg)
- **Pattern**: Repository pattern (no ORM)
- **Migration System**: Custom SQL migrations

### Schema Overview (19 Main Tables)

#### Core User & Workspace
- `users` - User accounts with OAuth support
- `oauth_accounts` - OAuth provider links
- `oauth_auth_codes` - OAuth authorization codes
- `starships` - Workspaces owned by users

#### Agent & Tool System
- `agent_templates` - Marketplace agent templates
- `agents` - Deployed agent instances
- `tool_templates` - Marketplace tool templates
- `tools` - Deployed tool instances
- `agent_tools` - Agent ↔ Tool many-to-many junction

#### Conversation System
- `conversations` - Chat conversations
- `messages` - Individual messages
- `conversation_agents` - Conversation ↔ Agent junction

#### Security
- `environments` - Encrypted environment variables (per starship)
- `email_verification_tokens` - Email verification
- `password_reset_tokens` - Password reset
- `email_change_tokens` - Email change requests

#### Billing & Usage
- `wallets` - Starship wallets
- `topups` - Payment top-ups via Stripe
- `ledger_entries` - Immutable transaction ledger
- `usage` - LLM token usage tracking
- `promo_redemptions` - Promo code tracking

### Database Patterns

#### Connection Management
```typescript
// Location: packages/models/src/helpers/database/postgres-connection.ts
const connection = PostgresConnection.getInstance();
const pool = connection.getPool();
```

#### Repository Pattern
```typescript
// All repositories extend BaseRepository
export class UserRepository extends BaseRepository<UserEntity> {
  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.executeWithErrorHandling(async () => {
      const result = await this.pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] ? UserEntity.deserialize(result.rows[0]) : null;
    });
  }
}
```

#### Entity Serialization
```typescript
// Entities handle snake_case ↔ camelCase conversion
export class UserEntity {
  id!: string;
  email!: string;
  createdAt!: Date;  // camelCase in app

  static deserialize(data: any): UserEntity {
    const entity = new UserEntity();
    entity.id = data.id;
    entity.email = data.email;
    entity.createdAt = new Date(data.created_at);  // from snake_case
    return entity;
  }

  serialize(): UserModel {
    return {
      id: this.id,
      email: this.email,
      createdAt: this.createdAt.toISOString()
    };
  }
}
```

### Migrations

**Location**: `packages/models/src/migrations/`

**Running Migrations**:
```bash
cd packages/models
pnpm run db-cli migrate up    # Apply migrations
pnpm run db-cli migrate down  # Rollback
```

**Key Migration Files**:
- `000_postgresql_schema.ts` - Complete base schema
- `002_add_email_change_tokens.ts` - Email change feature

---

## Key Domain Concepts

### Starship
- **What**: A workspace/environment for agents, tools, and conversations
- **Ownership**: One user owns many starships
- **Configuration**: Max agents, environment variables, billing wallet
- **URL Pattern**: `/ship/[slug]`
- **Database**: `starships` table

### Agent
- **What**: An AI worker with specific capabilities and tools
- **Types**: Template-based or custom
- **Deployment**: Deployed to a specific starship
- **Blueprint**: JSONB workflow defining agent behavior
- **Model**: LLM model (GPT-4, Claude, etc.)
- **Tools**: Can use multiple tools via `agent_tools` junction table
- **Database**: `agents` table

### Agent Template
- **What**: Reusable agent configuration from marketplace
- **Public**: Can be browsed and instantiated by users
- **Categories**: coding, analysis, support, creative, etc.
- **Instantiation**: Creates a deployed agent from template
- **Database**: `agent_templates` table

### Tool
- **What**: Executable function/API that agents can use
- **Types**: HTTP calls, calculations, database queries, etc.
- **Blueprint**: JSONB workflow defining tool execution
- **Configuration**: Tool-specific settings (API keys, etc.)
- **Database**: `tools` table

### Conversation
- **What**: Chat session with agents
- **Status**: active, paused, completed, archived
- **Messages**: One-to-many with messages
- **Agents**: Many-to-many via `conversation_agents`
- **Streaming**: SSE for real-time updates
- **State**: JSONB for runtime state
- **Database**: `conversations` table

### Message
- **Roles**: user, assistant, system, tool
- **Types**: user_input, agent_response, system_notification, tool_result
- **Tool Calls**: JSONB array of tool invocations
- **Agent Attribution**: Which agent generated the message
- **Database**: `messages` table

### Workflow (Autopilot)
- **What**: DAG of nodes and edges executed by Autopilot engine
- **Execution**: State machine with event streaming
- **Blueprint**: Definition stored as JSONB in various tables
- **State**: Immutable state updates via JSON patches
- **Event Streaming**: Real-time updates via SSE

---

## Autopilot Workflow Engine

### Overview
The Autopilot engine executes DAG (Directed Acyclic Graph) workflows with typed nodes.

**Engine Location**: `packages/autopilot/src/engine/Engine.ts`

### Blueprint Structure
```typescript
{
  nodes: [
    { ref: 'start', type: 'start', name: 'Begin', parameters: {} },
    { ref: 'llm', type: 'llm', name: 'AI', parameters: {
      model: 'gpt-4o',
      prompt: 'Analyze: {{ $input }}'
    }},
    { ref: 'end', type: 'end', name: 'End', parameters: {
      output: '{{ $lastOutputOf("llm") }}'
    }}
  ],
  edges: [
    { ref: 'e1', from: 'start', to: 'llm' },
    { ref: 'e2', from: 'llm', to: 'end' }
  ]
}
```

### Node Types

#### Control Flow
- **Start** - Entry point (required, single)
- **End** - Exit point with output extraction (required, multiple possible)

#### AI & Computation
- **LLM** - Call LLM APIs (OpenAI, Anthropic, OpenRouter)
  - Parameters: model, prompt, temperature, maxTokens
- **Agent** - Execute sub-agents with tool access
- **Code** - Execute sandboxed JavaScript with `async function main(ctx)`

#### Data Operations
- **Transform** - Transform data with JSONata expressions
- **Mutate** - Mutate workflow state
- **Conditional** - Branch based on conditions

#### Integration
- **HTTP Request** - Make HTTP calls
- **Tool** - Execute tool blueprints
- **Workflow** - Execute sub-workflows
- **User Prompt** - Wait for user input

### Template Expressions

Autopilot supports dynamic template expressions:

```typescript
// Access input
{{ $input }}

// Access last output of a node
{{ $lastOutputOf("nodeRef") }}

// Access workflow state
{{ $state.someValue }}

// Access environment variables
{{ $env.API_KEY }}

// JSONata expressions in Transform nodes
$sum(items.price)
```

### Event Streaming

Workflows emit events via SSE:

```typescript
// Event types
type WorkflowEvent =
  | { type: 'workflow.started', data: { workflowId: string } }
  | { type: 'node.started', data: { nodeRef: string } }
  | { type: 'node.completed', data: { nodeRef: string, output: any } }
  | { type: 'workflow.completed', data: { output: any } }
  | { type: 'workflow.failed', data: { error: string } };
```

### Code Node Pattern (IMPORTANT)

Code nodes now use **module-style** (breaking change from eval-style):

```javascript
// CORRECT (module-style)
async function main(ctx) {
  const input = ctx.$input;
  const state = ctx.$state;
  const lastOutput = ctx.$lastOutputOf('previousNode');

  // Your logic here
  const result = input.toUpperCase();

  return result;  // Return value becomes node output
}

// INCORRECT (old eval-style - no longer supported)
const result = $input.toUpperCase();
```

---

## Development Workflows

### Daily Development

```bash
# Start development environment
pnpm dev

# In separate terminals, you can also run individual packages:
cd packages/client && pnpm dev
cd packages/server && pnpm dev

# Type checking (run before commits)
pnpm type-check

# Linting
pnpm lint

# Testing
pnpm test

# Build for production
pnpm build
```

### Working with Database

```bash
# Start PostgreSQL container
pnpm run postgres:install

# Access psql shell
pnpm run postgres:shell

# Create backup
pnpm run postgres:backup

# Run migrations
cd packages/models
pnpm run db-cli migrate up

# Reset database
pnpm run postgres:reset
pnpm run postgres:install
# Then run migrations again
```

### Adding a New Package

1. Create package directory: `packages/new-package/`
2. Add `package.json` with workspace dependencies
3. Add to `pnpm-workspace.yaml` (usually auto-detected via `packages/*`)
4. Add to `turbo.json` pipeline if needed
5. Run `pnpm install` from root

### Build Order (Turborepo)

Dependencies are managed automatically, but the logical build order is:

1. `@starships/autopilot` (foundation)
2. `@starships/protocol` → depends on autopilot
3. `@starships/errors` → depends on protocol
4. `@starships/env` (independent)
5. `@starships/models` → depends on env, errors, protocol, autopilot
6. `@starships/server` → depends on models, autopilot, errors
7. `@starships/client` → depends on autopilot, protocol

---

## Client Architecture (Next.js)

### Directory Structure

```
packages/client/src/
├── app/                    # Next.js 15 app directory (routes)
│   ├── page.tsx            # Landing page
│   ├── login/              # Auth pages
│   ├── marketplace/        # Agent/tool marketplace
│   ├── ship/[slug]/        # Starship workspace (main app)
│   └── profile/            # User settings
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── agents/             # Agent-related components
│   ├── conversation/       # Chat UI
│   ├── workflow/           # Workflow visualization (React Flow)
│   └── ...
├── hooks/                  # Custom React hooks
│   ├── useConversations.ts
│   ├── useAgents.ts
│   └── ...
├── lib/                    # Client utilities
│   ├── api-client.ts       # HTTP client
│   ├── sse-client.ts       # SSE streaming
│   └── utils.ts
├── store/                  # Zustand stores
│   ├── starship-store.ts
│   └── user-store.ts
└── styles/                 # Global styles
    └── globals.css
```

### TanStack Query Pattern

#### Query Keys (Hierarchical)

```typescript
// packages/client/src/hooks/useConversations.ts
export const CONVERSATION_QUERY_KEYS = {
  all: ['conversations'] as const,
  lists: () => [...CONVERSATION_QUERY_KEYS.all, 'list'] as const,
  list: (starshipId: string) => [...CONVERSATION_QUERY_KEYS.lists(), starshipId] as const,
  details: () => [...CONVERSATION_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...CONVERSATION_QUERY_KEYS.details(), id] as const,
  messages: (id: string) => [...CONVERSATION_QUERY_KEYS.detail(id), 'messages'] as const,
};
```

#### Query Hook Pattern

```typescript
export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId),
    queryFn: () => apiClient.getConversation(conversationId),
    staleTime: 30_000,  // 30 seconds
  });
}
```

#### Mutation with Optimistic Updates

```typescript
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiClient.sendMessage(conversationId, content),

    onMutate: async (content) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId)
      });

      // Snapshot previous value
      const previous = queryClient.getQueryData(
        CONVERSATION_QUERY_KEYS.messages(conversationId)
      );

      // Optimistically update
      queryClient.setQueryData(
        CONVERSATION_QUERY_KEYS.messages(conversationId),
        (old: Message[]) => [
          ...old,
          {
            id: nanoid(),
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
            // Optimistic flag
            _optimistic: true
          }
        ]
      );

      return { previous };
    },

    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(
          CONVERSATION_QUERY_KEYS.messages(conversationId),
          context.previous
        );
      }
    },

    onSuccess: () => {
      // Invalidate to refetch
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId)
      });
    }
  });
}
```

### SSE Streaming Pattern

```typescript
// packages/client/src/lib/sse-client.ts
export function subscribeToConversation(
  conversationId: string,
  onEvent: (event: ConversationEvent) => void
) {
  const eventSource = new EventSource(
    `${SERVER_URL}/api/v1/conversations/${conversationId}/stream`,
    { withCredentials: true }
  );

  eventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
  };

  eventSource.onerror = (e) => {
    console.error('SSE error:', e);
    eventSource.close();
  };

  return () => eventSource.close();
}

// Usage in component
useEffect(() => {
  const unsubscribe = subscribeToConversation(conversationId, (event) => {
    if (event.type === 'message.created') {
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId)
      });
    }
  });

  return unsubscribe;
}, [conversationId]);
```

---

## Server Architecture (Express)

### Directory Structure

```
packages/server/src/
├── index.ts                # Server entry point
├── routes/                 # Express route handlers
│   ├── index.ts            # Route aggregator
│   ├── auth.ts             # Authentication routes
│   ├── starships.ts        # Starship CRUD
│   ├── agents.ts           # Agent management
│   ├── conversations.ts    # Conversation & messaging
│   └── ...
├── services/               # Business logic layer
│   ├── AgentService.ts
│   ├── ConversationService.ts
│   ├── MessageService.ts
│   ├── StarshipService.ts
│   ├── ToolService.ts
│   ├── WalletService.ts
│   ├── StripeService.ts
│   └── EmailService.ts
├── middleware/             # Express middleware
│   ├── authenticate.ts     # JWT validation
│   ├── validate.ts         # Zod validation
│   ├── error-handler.ts    # Error handling
│   └── rate-limiter.ts     # Rate limiting
├── schemas/                # Zod validation schemas
│   ├── agent-schemas.ts
│   ├── conversation-schemas.ts
│   └── ...
├── types/                  # Server-specific types
└── utils/                  # Server utilities
```

### Route Pattern

```typescript
// packages/server/src/routes/conversations.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createConversationSchema } from '../schemas/conversation-schemas';
import { ConversationService } from '../services/ConversationService';

const router = Router();
const conversationService = new ConversationService();

// List conversations
router.get('/conversations',
  authenticate,
  async (req, res, next) => {
    try {
      const starshipId = req.query.starshipId as string;
      const conversations = await conversationService.listConversations(starshipId);
      res.json({ data: conversations });
    } catch (error) {
      next(error);
    }
  }
);

// Create conversation
router.post('/conversations',
  authenticate,
  validate(createConversationSchema),
  async (req, res, next) => {
    try {
      const conversation = await conversationService.createConversation({
        starshipId: req.body.starshipId,
        userId: req.user.id
      });
      res.status(201).json({ data: conversation });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
```

### Service Pattern

```typescript
// packages/server/src/services/ConversationService.ts
export class ConversationService {
  private conversationRepo: ConversationRepository;
  private messageRepo: MessageRepository;
  private agentRepo: AgentRepository;

  constructor() {
    this.conversationRepo = new ConversationRepository();
    this.messageRepo = new MessageRepository();
    this.agentRepo = new AgentRepository();
  }

  async createConversation(data: CreateConversationData): Promise<ConversationModel> {
    // COMPLEX business logic - multi-step operation

    // 1. Validate starship access
    await this.validateStarshipAccess(data.starshipId, data.userId);

    // 2. Create conversation
    const conversation = await this.conversationRepo.createConversation({
      starshipId: data.starshipId,
      status: 'active',
      state: {}
    });

    // 3. Create welcome message
    await this.messageRepo.createMessage({
      conversationId: conversation.id,
      role: 'system',
      type: 'system_notification',
      content: 'Conversation started'
    });

    // 4. Log activity
    await this.logConversationActivity(conversation.id, 'created');

    return conversation.serialize();
  }

  private async validateStarshipAccess(starshipId: string, userId: string): Promise<void> {
    // Business rule enforcement
  }
}
```

### Zod Validation Pattern

```typescript
// packages/server/src/schemas/conversation-schemas.ts
import { z } from 'zod';

export const createConversationSchema = z.object({
  body: z.object({
    starshipId: z.string().min(1, 'Starship ID is required'),
    agentIds: z.array(z.string()).optional(),
    initialMessage: z.string().optional()
  })
});

export const sendMessageSchema = z.object({
  params: z.object({
    conversationId: z.string()
  }),
  body: z.object({
    content: z.string().min(1, 'Message content is required'),
    agentId: z.string().optional()
  })
});
```

### Middleware Pattern

```typescript
// packages/server/src/middleware/authenticate.ts
import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../utils/jwt';
import { UnauthorizedError } from '@starships/errors';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const payload = await verifyJWT(token);
    req.user = { id: payload.userId, email: payload.email };

    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid token'));
  }
}
```

---

## Testing Strategy

### Framework
- **Test Runner**: Jest 30 with ts-jest
- **Config**: Root `jest.config.js` with per-package projects
- **Pattern**: Tests in `__tests__/` directories or `*.test.ts` files

### Coverage by Package

#### autopilot - ✅ Comprehensive
- Engine execution tests
- Node tests (LLM, HTTP, Conditional, Transform, etc.)
- Blueprint builder tests
- Template expression evaluation tests

#### models - ✅ Good Coverage
- Repository tests (with mocked database)
- Entity validation tests
- Serialization/deserialization tests

#### errors - ✅ Full Coverage
- Custom error class tests
- Error code validation

#### server - ⚠️ Limited
- Mostly integration tested manually
- Service layer tests (sparse)

#### client - ❌ No Automated Tests
- Manual UI testing

### Test Patterns

#### Unit Test Example
```typescript
// packages/autopilot/src/tests/nodes/LLMNode.test.ts
import { LLMNode } from '../../nodes/LLMNode';
import { ExecutionContext } from '../../engine/ExecutionContext';

describe('LLMNode', () => {
  it('should execute LLM call with template prompt', async () => {
    const node = new LLMNode({
      ref: 'llm1',
      type: 'llm',
      name: 'Test LLM',
      parameters: {
        model: 'gpt-4o',
        prompt: 'Analyze: {{ $input }}'
      }
    });

    const context = new ExecutionContext({
      input: 'Hello world'
    });

    const result = await node.execute(context);

    expect(result).toBeDefined();
    expect(result.output).toContain('analysis');
  });
});
```

#### Repository Test Example
```typescript
// packages/models/src/repositories/__tests__/UserRepository.test.ts
import { UserRepository } from '../UserRepository';
import { mockPool } from '../../tests/setup';

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    repo = new UserRepository();
    mockPool.query.mockClear();
  });

  it('should find user by email', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: '1', email: 'test@example.com', created_at: new Date() }]
    });

    const user = await repo.findByEmail('test@example.com');

    expect(user).toBeDefined();
    expect(user?.email).toBe('test@example.com');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM users WHERE email = $1'),
      ['test@example.com']
    );
  });
});
```

### Running Tests

```bash
# All tests
pnpm test

# Specific package
cd packages/autopilot && pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

---

## Environment Configuration

### Key Environment Variables

```bash
# Server
SERVER_PORT=4000
SERVER_URL=http://localhost:4000

# Client
CLIENT_PORT=3000
CLIENT_URL=http://localhost:3000
PUBLIC_URL=http://localhost:8080

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DATABASE=starships
POSTGRES_SSL=false

# Security
JWT_SECRET=your-secret-key-at-least-32-characters
ENCRYPTION_KEY=your-encryption-key-64-hex-characters

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-v1-...
DEFAULT_LLM_PROVIDER=openai
DEFAULT_CHAT_MODEL=gpt-4o

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
AWS_SES_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
EMAIL_FROM_ADDRESS=noreply@starships.ai

# Monitoring
SENTRY_DSN_CLIENT=https://...
SENTRY_DSN_SERVER=https://...
LOG_LEVEL=info

# Analytics
GA_MEASUREMENT_ID=G-...
USERBACK_TOKEN=...
```

### Environment Files

- `.env.example` - Template (committed)
- `.env` - Local development (gitignored)
- `.env.production` - Production values (gitignored)

### Loading Environment

```typescript
// All packages use @starships/env
import { getEnv } from '@starships/env';

const config = {
  port: getEnv('SERVER_PORT', '4000'),
  databaseUrl: getEnv('DATABASE_URL'),  // Required, no default
  logLevel: getEnv('LOG_LEVEL', 'info')
};
```

---

## Code Style & Conventions

### TypeScript

- **Strict Mode**: Enabled (`strict: true`)
- **No Implicit Any**: Enforced
- **Path Aliases**: `@starships/*` for workspace packages, `@/*` for package-internal

### Naming Conventions

#### Files
- **PascalCase**: Classes, components, entities
  - `AgentService.ts`, `ConversationEntity.ts`, `Button.tsx`
- **kebab-case**: Utilities, non-class files
  - `serialization-helper.ts`, `api-client.ts`
- **camelCase**: React hooks
  - `useConversations.ts`, `useAgents.ts`

#### Code
- **camelCase**: Variables, functions, methods
  - `const userId = ...`, `function createAgent() {}`
- **PascalCase**: Classes, interfaces, types, components
  - `class AgentService`, `interface AgentModel`, `const Button = () => {}`
- **UPPER_SNAKE_CASE**: Constants
  - `const MAX_RETRIES = 3`, `const API_BASE_URL = ...`

#### Database
- **snake_case**: Tables and columns
  - `agent_templates`, `created_at`, `user_id`
- Automatic conversion to camelCase in application layer via entities

#### IDs
- Generated using `nanoid`
- Format: `[a-z0-9_-]{10,30}`
- Example: `agt_k8s9d7f6g5h4j3`

### Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 140,
  "tabWidth": 2
}
```

### ESLint Rules

- TypeScript ESLint recommended rules
- Warnings for:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/no-unused-vars`
- Prettier integration (no conflicts)

---

## Common Tasks & Examples

### Creating a New API Endpoint

```typescript
// 1. Define domain type (protocol)
export interface TaskModel {
  id: string;
  title: string;
  status: string;
}

// 2. Create entity (models)
export class TaskEntity {
  @IsString() id!: string;
  @IsString() title!: string;
  // ... validation decorators

  static deserialize(data: any): TaskEntity { /* ... */ }
  serialize(): TaskModel { /* ... */ }
}

// 3. Create repository (models)
export class TaskRepository extends BaseRepository<TaskEntity> {
  async createTask(data: CreateTaskData): Promise<TaskEntity> {
    // SIMPLE CRUD only
  }
}

// 4. Create service (server)
export class TaskService {
  async completeTask(taskId: string): Promise<TaskModel> {
    // COMPLEX business logic
  }
}

// 5. Create route (server)
router.post('/tasks/:id/complete', authenticate, async (req, res, next) => {
  const task = await taskService.completeTask(req.params.id);
  res.json({ data: task });
});

// 6. Create hook (client)
export function useCompleteTask() {
  return useMutation({
    mutationFn: (id) => api.completeTask(id),
    // ... optimistic updates
  });
}
```

### Adding a New Autopilot Node Type

```typescript
// 1. Define node parameters interface
export interface CustomNodeParameters {
  apiKey: string;
  endpoint: string;
}

// 2. Create node class
export class CustomNode extends BaseNode<CustomNodeParameters> {
  async execute(context: ExecutionContext): Promise<NodeOutput> {
    const { apiKey, endpoint } = this.parameters;

    // Execute node logic
    const result = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    return {
      output: await result.json(),
      nextNodeRef: this.getNextNode()
    };
  }

  validate(): void {
    if (!this.parameters.apiKey) {
      throw new Error('API key is required');
    }
  }
}

// 3. Register node type
NodeFactory.register('custom', CustomNode);

// 4. Add tests
describe('CustomNode', () => {
  it('should execute custom API call', async () => {
    // Test implementation
  });
});
```

### Working with SSE Streaming

#### Server-Side (Express)

```typescript
// packages/server/src/routes/conversations.ts
router.get('/conversations/:id/stream',
  authenticate,
  async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const conversationId = req.params.id;

    // Subscribe to conversation events
    const unsubscribe = conversationService.subscribeToEvents(
      conversationId,
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    // Cleanup on close
    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  }
);
```

#### Client-Side (React)

```typescript
// packages/client/src/hooks/useConversationStream.ts
export function useConversationStream(conversationId: string) {
  const [events, setEvents] = useState<ConversationEvent[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(
      `${SERVER_URL}/api/v1/conversations/${conversationId}/stream`,
      { withCredentials: true }
    );

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [conversationId]);

  return events;
}
```

### Database Migration

```typescript
// packages/models/src/migrations/003_add_tasks.ts
import { PostgresConnection } from '../helpers/database/postgres-connection';

export async function up(): Promise<void> {
  const pool = PostgresConnection.getInstance().getPool();

  await pool.query(`
    CREATE TABLE tasks (
      id VARCHAR(30) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL,
      starship_id VARCHAR(30) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_tasks_starship_id ON tasks(starship_id);
    CREATE INDEX idx_tasks_status ON tasks(status);
  `);
}

export async function down(): Promise<void> {
  const pool = PostgresConnection.getInstance().getPool();

  await pool.query(`
    DROP TABLE IF EXISTS tasks;
  `);
}
```

---

## Deployment

### Docker Development

```bash
# Build image
docker build -t starships:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Docker Deployment (Fat Container)

The project uses a "fat container" strategy - single container with all services.

**Container includes**:
- Next.js frontend (Port 3000)
- Express backend (Port 4000)
- PostgreSQL 18 (Port 5432)
- Supervisor for process management

**Dockerfile**: `/home/user/starships.ai/Dockerfile`

```bash
# Build for production
docker build -t starships:prod .

# Run
docker run -d \
  -p 3000:3000 \
  -p 4000:4000 \
  -e POSTGRES_PASSWORD=secure-password \
  -e JWT_SECRET=your-jwt-secret \
  -e OPENAI_API_KEY=sk-... \
  -v starships-data:/var/lib/postgresql/data \
  starships:prod
```

### Kubernetes

**Manifests**: `/home/user/starships.ai/k8s/`
- `dev/` - Development environment
- `prod/` - Production environment

**Key resources**:
- Deployment (multi-replica)
- Service (LoadBalancer)
- ConfigMap (non-secret config)
- Secret (sensitive config)
- PersistentVolumeClaim (PostgreSQL data)

```bash
# Apply production manifests
kubectl apply -f k8s/prod/

# Check status
kubectl get pods -n starships
kubectl get services -n starships

# View logs
kubectl logs -f deployment/starships-app -n starships
```

### Infrastructure

**IaC Location**: `/home/user/starships.ai/infra/`
- Terraform/cloud provider configurations
- Cluster setup
- IAM and security configurations

### Health Checks

- **API Health**: `GET /api/v1/health`
- **Docker Health**: Configured in Dockerfile
- **Kubernetes Probes**: Liveness and readiness checks

---

## Error Handling

### Error Types

All errors inherit from `StarshipsError` in `@starships/errors`:

```typescript
// Common errors
- ValidationError - Invalid input data
- NotFoundError - Resource not found
- UnauthorizedError - Authentication failed
- ForbiddenError - Insufficient permissions
- ConflictError - Resource conflict (e.g., duplicate)
- InternalServerError - Unexpected errors
```

### Error Flow

```
Database Error
  ↓
Repository (catches, adds context)
  ↓
Service (catches, adds business context)
  ↓
Route Handler (catches, converts to HTTP)
  ↓
Error Middleware (formats response)
  ↓
Client (displays user-friendly message)
```

### Throwing Errors

```typescript
// In service
if (!starship) {
  throw new NotFoundError('Starship not found', { starshipId });
}

if (wallet.balance < cost) {
  throw new ValidationError('Insufficient balance', {
    balance: wallet.balance,
    required: cost
  });
}
```

### Handling Errors in Routes

```typescript
router.post('/conversations/:id/messages',
  authenticate,
  validate(sendMessageSchema),
  async (req, res, next) => {
    try {
      const message = await messageService.sendMessage(/* ... */);
      res.json({ data: message });
    } catch (error) {
      next(error);  // Pass to error middleware
    }
  }
);
```

### Error Middleware

```typescript
// packages/server/src/middleware/error-handler.ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: err.message });
  }

  // Default to 500
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Important Gotchas & Tips

### 1. Repository vs Service Scope

**❌ WRONG - Business logic in repository**:
```typescript
class ConversationRepository {
  async completeConversation(id: string) {
    // ❌ Multi-step logic doesn't belong here
    const conversation = await this.findById(id);
    conversation.status = 'completed';
    await this.update(id, conversation);
    await this.messageRepo.create({ /* ... */ });  // ❌ Cross-repository
    await this.logActivity(/* ... */);  // ❌ Business logic
    return conversation;
  }
}
```

**✅ CORRECT - Business logic in service**:
```typescript
class ConversationService {
  async completeConversation(id: string) {
    // ✅ Service coordinates multiple repositories
    const conversation = await this.conversationRepo.findById(id);
    conversation.status = 'completed';
    await this.conversationRepo.update(id, conversation);
    await this.messageRepo.create({ /* ... */ });
    await this.activityService.log({ /* ... */ });
    return conversation;
  }
}

class ConversationRepository {
  async update(id: string, data: Partial<ConversationEntity>) {
    // ✅ Simple update only
  }
}
```

### 2. Entity Serialization

Always use `deserialize()` when reading from DB, `serialize()` when sending to client:

```typescript
// ✅ CORRECT
const rows = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
const user = UserEntity.deserialize(rows[0]);  // DB → Entity
return user.serialize();  // Entity → Client

// ❌ WRONG
const rows = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
return rows[0];  // Returns snake_case fields
```

### 3. Query Key Invalidation

Invalidate queries hierarchically:

```typescript
// ✅ CORRECT - Invalidates all conversation queries
queryClient.invalidateQueries({ queryKey: CONVERSATION_KEYS.all });

// ✅ CORRECT - Invalidates specific conversation
queryClient.invalidateQueries({ queryKey: CONVERSATION_KEYS.detail(id) });

// ❌ WRONG - Only invalidates exact match
queryClient.invalidateQueries({ queryKey: ['conversations'] });
```

### 4. Autopilot Code Nodes

Use module-style, not eval-style:

```javascript
// ✅ CORRECT (module-style)
async function main(ctx) {
  const input = ctx.$input;
  return input.toUpperCase();
}

// ❌ WRONG (old eval-style)
const result = $input.toUpperCase();
```

### 5. Environment Variables

Always provide defaults for non-critical variables:

```typescript
// ✅ CORRECT
const port = getEnv('SERVER_PORT', '4000');
const logLevel = getEnv('LOG_LEVEL', 'info');

// ❌ WRONG - Will throw if not set
const port = getEnv('SERVER_PORT');  // Required but should have default
```

### 6. Database Migrations

Always provide both `up()` and `down()`:

```typescript
// ✅ CORRECT
export async function up() { /* create table */ }
export async function down() { /* drop table */ }

// ❌ WRONG
export async function up() { /* create table */ }
// Missing down() function
```

### 7. Error Handling in Async Routes

Always pass errors to `next()`:

```typescript
// ✅ CORRECT
router.get('/data', async (req, res, next) => {
  try {
    const data = await service.getData();
    res.json({ data });
  } catch (error) {
    next(error);  // Pass to error middleware
  }
});

// ❌ WRONG
router.get('/data', async (req, res) => {
  const data = await service.getData();  // Unhandled promise rejection
  res.json({ data });
});
```

### 8. SSE Connection Cleanup

Always cleanup event sources:

```typescript
// ✅ CORRECT
useEffect(() => {
  const eventSource = new EventSource(url);
  eventSource.onmessage = handleEvent;

  return () => eventSource.close();  // Cleanup
}, [url]);

// ❌ WRONG
useEffect(() => {
  const eventSource = new EventSource(url);
  eventSource.onmessage = handleEvent;
  // No cleanup - memory leak
}, [url]);
```

---

## Migration Context (Important)

### Status: 95% Complete

The codebase recently migrated from **Neo4j** to **PostgreSQL** (95% complete).

**Completed**:
- ✅ All repositories converted to PostgreSQL
- ✅ All entities migrated
- ✅ Core scripts modernized
- ✅ Database schema finalized
- ✅ Migrations system implemented

**Remaining (~20 TypeScript errors)**:
- Test file updates
- Health endpoint refinements
- Minor type adjustments

### Breaking Changes from Migration

1. **Autopilot Code Nodes**: Now use module-style (see above)
2. **Repository Methods**: Some method signatures changed
3. **Entity IDs**: Now use nanoid instead of UUID

---

## Quick Debugging Tips

### Check Database Connection
```bash
pnpm run postgres:shell
\dt  # List tables
\d users  # Describe users table
SELECT * FROM users LIMIT 5;
```

### Check API Health
```bash
curl http://localhost:4000/api/v1/health
```

### View Logs
```bash
# Client logs (Next.js)
cd packages/client && pnpm dev
# Check browser console

# Server logs (Express)
cd packages/server && pnpm dev
# Check terminal output

# Docker logs
docker-compose logs -f
```

### Check TypeScript Errors
```bash
pnpm type-check
# Or per package
cd packages/server && pnpm type-check
```

### Test Specific Feature
```bash
cd packages/autopilot
pnpm test -- --testPathPattern=LLMNode
```

---

## Additional Resources

### Key Documentation Files

1. **Architecture**:
   - `docs/layered-architecture-patterns.md` - 6-layer architecture (CRITICAL)
   - `docs/er-diagram.md` - Database ER diagram

2. **Migration**:
   - `MIGRATION_SPEC.md` - Neo4j → PostgreSQL migration details

3. **Deployment**:
   - `docs/dev-aws-eks-fat-container-plan.md` - AWS EKS deployment
   - `docs/todo-prod-deploy-plan.md` - Production deployment plan

4. **Operations**:
   - `docs/disaster-recovery-guide.md` - DR procedures

5. **Package READMEs**:
   - `README.md` - Root overview
   - `packages/autopilot/README.md` - Autopilot guide
   - `packages/server/README.md` - Server API guide
   - `packages/client/README.md` - Client guide

### API Base URL

```
Development: http://localhost:4000/api/v1
Production: Configure via PUBLIC_URL environment variable
```

### Example API Requests

```bash
# Create starship
curl -X POST http://localhost:4000/api/v1/starships \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Enterprise","slug":"enterprise"}'

# Create conversation
curl -X POST http://localhost:4000/api/v1/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"starshipId":"<starshipId>"}'

# Send message
curl -X POST http://localhost:4000/api/v1/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello, world!"}'
```

---

## Summary Checklist for AI Assistants

When working on this codebase:

- [ ] Follow the 6-layer architecture (Domain → Entity → Repository → Service → Route → Hook)
- [ ] Keep repositories SIMPLE (CRUD only, no business logic)
- [ ] Put business logic in SERVICES (multi-step, cross-entity operations)
- [ ] Always use Entity.deserialize() / .serialize() for DB operations
- [ ] Use TanStack Query with hierarchical query keys
- [ ] Implement optimistic updates with rollback in mutations
- [ ] Use Zod schemas for all API validation
- [ ] Add proper error handling with custom error types
- [ ] Write tests for new features (especially autopilot and models)
- [ ] Use module-style for Autopilot code nodes
- [ ] Run type-check before committing
- [ ] Follow naming conventions (PascalCase, camelCase, snake_case)
- [ ] Cleanup SSE connections in useEffect
- [ ] Provide migration up() and down() functions
- [ ] Use environment variables with sensible defaults

---

**End of CLAUDE.md**

> This guide is maintained by the Starships.ai team. For questions or updates, please open an issue or submit a PR.
