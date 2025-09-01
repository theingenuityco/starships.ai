# @starships/protocol

TypeScript protocol definitions and contracts for the starships.ai platform. This package provides centralized type definitions, API contracts, database domains, and standardized error handling across all services.

## Overview

The protocol package serves as the single source of truth for:

- **API Contracts** - Interface definitions for cross-service communication
- **Collection Types** - Database collection types (Starship, Mission, Agent, etc.)
- **Socket.IO Events** - Real-time communication protocols
- **Request/Response Types** - HTTP API input/output structures

## Installation

```bash
pnpm add @starships/protocol
```

## Core Exports

### Collection Types

```typescript
import {
  Starship,
  Mission,
  Agent,
  User,
  Workflow,
  NativeToolApiKey
} from '@starships/protocol';
```

**Key domain types:**
- [`Agent`](src/domains/agent.ts) - AI agent configurations and deployment management
- [`Starship`](src/domains/starship.ts) - Starship management with billing integration
- [`Mission`](src/domains/mission.ts) - Mission orchestration with workflow execution
- [`User`](src/domains/user.ts) - User management and authentication
- [`Workflow`](src/domains/workflow.ts) - Workflow execution definitions
- [`NativeToolApiKey`](src/domains/native-tool.ts) - Encrypted API key storage for native tools

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
├── domains/                # Database domain types
│   ├── agent.ts            # AI agent configurations and deployment
│   ├── starship.ts         # Starship management
│   ├── mission.ts          # Mission orchestration
│   ├── agent-template.ts   # Agent templates
│   ├── user.ts             # User management
│   ├── workflow.ts         # Workflow execution
│   ├── waitlist.ts         # Waitlist management
│   └── native-tool.ts      # Native tool API key storage
```

## Used By

This package is imported across the entire starships.ai platform:

- **`@starships/server`** - API route definitions, middleware, socket handlers
- **`@starships/client`** - Frontend API calls, socket communication, forms
- **`@starships/models`** - Repository interfaces, database collection mapping
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