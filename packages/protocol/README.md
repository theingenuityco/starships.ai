# @starships/protocol

TypeScript protocol definitions and contracts for the starships.ai platform. This package provides centralized type definitions, API contracts, database domains, and standardized error handling across all services.

## Overview

The protocol package serves as the single source of truth for:

- **API Contracts** - Interface definitions for cross-service communication
- **Collection Types** - Database collection types (Starship, Agent, Workflow, etc.)
- **Event Types** - Communication protocol types
- **Request/Response Types** - HTTP API input/output structures

## Installation

```bash
pnpm add @starships/protocol
```

## Core Exports

### Domain Types

```typescript
import {
  Starship,
  Agent,
  AgentTemplate,
  User,
  Workflow,
  Blueprint,
  Node,
  Edge,
  Execution,
  Conversation,
  Message,
  Memory,
  NativeToolApiKey,
  Waitlist,
} from '@starships/protocol';
```

**Key domain types:**

- [`Agent`](src/domains/agent.ts) - AI agent configurations and deployment management
- [`AgentTemplate`](src/domains/agent-template.ts) - Reusable agent configurations
- [`Starship`](src/domains/starship.ts) - Starship management with billing integration
- [`User`](src/domains/user.ts) - User management and authentication
- [`Workflow`](src/domains/workflow.ts) - Workflow execution definitions
- [`Blueprint`](src/domains/blueprint.ts) - Workflow blueprint specifications
- [`Node`](src/domains/node.ts) - Workflow node definitions and parameters
- [`Edge`](src/domains/edge.ts) - Workflow edge connections and routing
- [`Execution`](src/domains/execution.ts) - Workflow execution tracking and results
- [`Conversation`](src/domains/conversation.ts) - Chat and communication logs
- [`Message`](src/domains/message.ts) - Individual message storage and retrieval
- [`Memory`](src/domains/memory.ts) - Agent memory and conversation context
- [`NativeToolApiKey`](src/domains/native-tool.ts) - Encrypted API key storage for native tools
- [`Waitlist`](src/domains/waitlist.ts) - Early access user management

### API Contracts

```typescript
import { ApiResponse, ApiError } from '@starships/protocol';
```

**Contract interfaces:**

- [`API Response`](src/contracts/api-response.ts) - Standardized API response format
- [`Errors`](src/contracts/errors.ts) - Error response structures

## Usage Examples

### Type Usage Examples

```typescript
import { Starship, Agent } from '@starships/protocol';

// Using domain types for data modeling
const starship: Starship = {
  id: 'starship-123',
  slug: 'enterprise',
  ownerId: 'user-456',
  name: 'Enterprise',
  class: 'cruiser',
  status: 'active',
  maxAgents: 6,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// API Response formatting
import { ApiResponse } from '@starships/protocol';

const response: ApiResponse<Starship> = {
  success: true,
  data: starship,
  message: 'Starship retrieved successfully',
};
```

## Package Structure

```
src/
├── index.ts                 # Main exports
├── contracts/              # API boundary definitions
│   ├── agent.ts            # Agent management contracts
│   ├── chat.ts             # Chat system interfaces
│   ├── llm.ts              # LLM provider contracts
│   └── sybil.ts            # AI assistant protocols
├── domains/                # Database domain types
│   ├── agent.ts            # AI agent configurations and deployment
│   ├── starship.ts         # Starship management
│   ├── agent-template.ts   # Agent templates
│   ├── user.ts             # User management
│   ├── workflow.ts         # Workflow execution
│   ├── waitlist.ts         # Waitlist management
│   └── native-tool.ts      # Native tool API key storage
```

## Used By

This package is imported across the entire starships.ai platform:

- **`@starships/server`** - API route definitions, middleware, and services
- **`@starships/client`** - Frontend API calls, forms, and user interfaces
- **`@starships/models`** - Repository interfaces, database collection mapping
- **`@starships/agent-engine`** - Chat processing, LLM integration

## Type Safety

All exports use strict TypeScript with comprehensive type definitions:

```typescript
// Workflow with full type safety
const workflow: Workflow = {
  id: 'workflow-123',
  starshipId: 'starship-456',
  name: 'Market Research Workflow',
  description: 'Analyze competitor landscape using AI agents',
  status: 'active',
  nodes: [],
  edges: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  createdBy: 'user-789',
};
```

## Development

```bash
# Type checking
pnpm run type-check

# Linting
pnpm run lint

# Build
pnpm run build
```

## API Reference

For complete API documentation and examples, see the [API Design Guide](../../docs/api-design.md).
