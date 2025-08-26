# @starships/protocol

TypeScript protocol definitions and contracts for the starships.ai platform. This package provides centralized type definitions, API contracts, domain entities, and standardized error handling across all services.

## Overview

The protocol package serves as the single source of truth for:

- **API Contracts** - Interface definitions for cross-service communication
- **Domain Entities** - Core business object types (Starship, Mission, Agent, etc.)
- **Socket.IO Events** - Real-time communication protocols  
- **Error System** - Standardized error classes and codes
- **Request/Response Types** - HTTP API input/output structures

## Installation

```bash
pnpm add @starships/protocol
```

## Core Exports

### Domain Entities

```typescript
import { 
  Starship, 
  Mission, 
  Agent, 
  User, 
  Vision,
  Workflow 
} from '@starships/protocol';
```

**Key domain types:**
- [`Starship`](src/domain/starship.ts) - Starship management with billing integration
- [`Mission`](src/domain/mission.ts) - Mission orchestration with workflow execution
- [`Agent`](src/domain/agent-template.ts) - AI agent configurations and templates
- [`User`](src/domain/user.ts) - User management and authentication
- [`Vision`](src/domain/vision.ts) - Vision refinement system
- [`Workflow`](src/domain/workflow.ts) - Workflow execution definitions

### API Contracts

```typescript
import {
  ChatRequest,
  ChatResponse,
  SibilRequest,
  SibilResponse,
  AgentSocketRequest
} from '@starships/protocol';
```

**Contract interfaces:**
- [`Agent contracts`](src/contracts/agent.ts) - Agent creation and management APIs
- [`Chat contracts`](src/contracts/chat.ts) - Chat system interfaces
- [`LLM contracts`](src/contracts/llm.ts) - Language model provider APIs
- [`Sibil contracts`](src/contracts/sibil.ts) - AI assistant communication protocols
- [`Socket contracts`](src/contracts/socket.ts) - Real-time event definitions

### Error Types

```typescript
import type {
  StandardErrorCode,
  ErrorCategory,
  ErrorSeverity,
  ErrorInfo,
  ErrorResponse
} from '@starships/protocol';

// Error types for consistent error handling
const errorCode: StandardErrorCode = 'VALIDATION_ERROR';
const category: ErrorCategory = 'validation';
```

**Error types and interfaces:**
- [`StandardErrorCode`](src/core/errors/types.ts:40) - Standardized error codes
- [`ErrorCategory`](src/core/errors/types.ts:23) - Error classification
- [`ErrorSeverity`](src/core/errors/types.ts:14) - Error severity levels
- [`ErrorInfo`](src/core/errors/types.ts:161) - Core error information structure
- [`ErrorResponse`](src/core/errors/types.ts:192) - API error response format

> **Note:** Error class implementations are provided by `@starships/models` package.

## Usage Examples

### Creating API Endpoints

```typescript
import { 
  CreateMissionRequest, 
  MissionResponse,
  UpdateMissionRequest 
} from '@starships/protocol';

export async function createMission(
  req: CreateMissionRequest
): Promise<MissionResponse> {
  // Implementation
}
```

### Socket.IO Communication

```typescript
import {
  SibilSocketRequest,
  SibilSocketStreamChunk,
  AgentSocketRequest
} from '@starships/protocol';

// Handle real-time AI streaming
socket.on('sibil:stream', (request: SibilSocketRequest) => {
  // Process AI request
});
```

### Error Handling

```typescript
import type { ErrorResponse, StandardErrorCode } from '@starships/protocol';
import { ErrorFactory, BaseError } from '@starships/models';

try {
  // Business logic
} catch (error) {
  if (error instanceof BaseError) {
    return error.toResponse();
  }
  
  // Convert generic errors using models package
  throw ErrorFactory.database('Database operation failed');
}
```

## Package Structure

```
src/
├── index.ts                 # Main exports
├── contracts/              # API boundary definitions
│   ├── agent.ts            # Agent management contracts
│   ├── chat.ts             # Chat system interfaces
│   ├── llm.ts              # LLM provider contracts
│   ├── sibil.ts            # AI assistant protocols
│   └── socket.ts           # Real-time event contracts
├── domain/                 # Business entity types
│   ├── starship.ts         # Starship management
│   ├── mission.ts          # Mission orchestration
│   ├── agent-template.ts   # Agent templates
│   ├── user.ts             # User management
│   ├── vision.ts           # Vision refinement
│   ├── workflow.ts         # Workflow execution
│   └── waitlist.ts         # Waitlist management
└── core/                   # Core system types
    └── errors/             # Standardized error system
        ├── index.ts        # Error exports
        ├── types.ts        # Error type definitions
        └── classes.ts      # Error class implementations
```

## Used By

This package is imported across the entire starships.ai platform:

- **`@starships/server`** - API route definitions, middleware, socket handlers
- **`@starships/client`** - Frontend API calls, socket communication, forms
- **`@starships/models`** - Repository interfaces, database entity mapping
- **`@starships/agent-engine`** - Chat processing, LLM integration

## Type Safety

All exports use strict TypeScript with comprehensive type definitions:

```typescript
// Mission with full type safety
const mission: Mission = {
  id: 'mission-123',
  starshipId: 'starship-456', 
  name: 'Market Research',
  description: 'Analyze competitor landscape',
  status: 'active',           // Type: MissionStatus
  phase: 'analysis',          // Type: MissionPhase  
  agentIds: ['agent-1'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  createdBy: 'user-789'
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