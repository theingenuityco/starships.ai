# @starships/models

Comprehensive data access layer and repository implementations for starships.ai, providing Neo4j database integration, entity management, and automated migration system.

## Overview

This package provides:

- **Neo4j Database Integration** - Graph database connectivity and session management
- **Repository Pattern** - Standardized data access with direct repository imports
- **Serialization System** - Professional data transformation using class-transformer
- **Error Handling** - Unified error system with proper categorization
- **Performance Monitoring** - Built-in logging and performance tracking
- **Migration System** - Database schema management and seeding
- **Backup & Recovery** - Database maintenance utilities

## Quick Start

```typescript
import { StarshipRepository, AgentRepository, UserRepository, createConnection, Neo4jConfig } from '@starships/models';

// 1. Initialize database connection
const config: Neo4jConfig = {
  uri: '[NEO4J-LOCAL-URL]',
  username: 'neo4j',
  password: 'password',
  database: 'starships',
};

const connection = createConnection(config);
await connection.connect();

// 2. Use repositories directly
const starshipRepo = new StarshipRepository();
const starships = await starshipRepo.findAll();
```

## Core Concepts

### Core Domain Model

- **Starships**: Configurable AI platforms with different classes (`scout`, `cruiser`, `draught`) and subscription billing
- **Agents**: AI entities with deployment management and template system
- **Missions**: Task execution contexts with orchestrator communication and progress tracking
- **Workflows**: DAG-based automation blueprints with execution history
- **Users**: Authentication and authorization management
- **Agent Templates**: Reusable agent configurations for rapid deployment
- **Conversations**: Communication logs with structured metadata
- **Native Tools**: Encrypted API key management for external tool integration

### Direct Repository Usage

Direct repository instantiation for clean and simple data access:

```typescript
// Import and instantiate repositories directly
import { StarshipRepository, AgentRepository, MissionRepository, UserRepository } from '@starships/models';

const starshipRepo = new StarshipRepository();
const agentRepo = new AgentRepository();
const missionRepo = new MissionRepository();
const userRepo = new UserRepository();
```

### Error Handling

Standardized error system with proper categorization:

```typescript
import { ValidationError, NotFoundError, DatabaseError } from '@starships/models';

try {
  await starshipRepo.findById('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle not found
  } else if (error instanceof DatabaseError) {
    // Handle database issues
  }
}
```

## Available Repositories

| Repository                     | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| **StarshipRepository**         | Starship CRUD, agent deployment, subscription management |
| **AgentRepository**            | Agent lifecycle management and template instantiation    |
| **AgentTemplateRepository**    | Reusable agent configurations and marketplace            |
| **UserRepository**             | User accounts, authentication, and profiles              |
| **ConversationRepository**     | Chat history and communication logs                      |
| **MissionRepository**          | Mission orchestration and status tracking                |
| **MissionMessageRepository**   | Mission-specific communication logs                      |
| **MissionClarityRepository**   | Mission requirement analysis and feedback                |
| **WorkflowRepository**         | Workflow definitions, execution, and history             |
| **BlueprintRepository**        | Workflow blueprint storage and versioning                |
| **ExecutionRepository**        | Workflow execution tracking and results                  |
| **NodeRepository**             | Workflow node definitions and parameters                 |
| **EdgeRepository**             | Workflow edge connections and routing                    |
| **MemoryRepository**           | Agent memory and conversation context                    |
| **MessageRepository**          | Individual message storage and retrieval                 |
| **NativeToolApiKeyRepository** | Encrypted API key management for external tools          |
| **WaitlistRepository**         | Early access user onboarding queue                       |

## Database Management

### Migrations

```bash
# Run database migrations
npm run migrate

# Seed waitlist data
npm run seed:waitlist
```

### Backup & Recovery

```bash
# Create backup
npm run backup:create

# Restore from backup
npm run backup:restore

# Validate backup integrity
npm run backup:validate
```

### Performance Monitoring

```bash
# Monitor database performance
npm run monitor

# Cleanup abandoned starships
npm run cleanup:abandoned-starships

# Validate schema constraints
npm run validate-schema
```

## Usage Examples

### Starship Operations

```typescript
import { StarshipRepository } from '@starships/models';
const starshipRepo = new StarshipRepository();

// Create a new starship
const starship = await starshipRepo.create({
  name: 'Discovery One',
  class: 'cruiser',
  ownerId: 'user-123',
});

// Deploy an agent
await starshipRepo.deployAgent(starship.id, 'agent-456');

// Check available slots
const slots = await starshipRepo.getAvailableSlots(starship.id);
```

### Mission Management

```typescript
import { MissionRepository } from '@starships/models';
const missionRepo = new MissionRepository();

// Create mission
const mission = await missionRepo.createMission({
  title: 'Data Analysis Task',
  description: 'Analyze customer data patterns',
  starshipId: 'starship-123',
  agentIds: ['agent-456'],
  priority: 'high',
});

// Update mission status
await missionRepo.updateMission(mission.id, {
  status: 'active',
  phase: 'execution',
});
```

### Agent Template System

```typescript
import { AgentTemplateRepository, AgentRepository } from '@starships/models';

const templateRepo = new AgentTemplateRepository();
// Create reusable template
const template = await templateRepo.create({
  name: 'Data Analyst',
  category: 'analysis',
  isPublic: true,
});

// Instantiate from template
const agentRepo = new AgentRepository();
const agent = await agentRepo.createFromTemplate(template.id, 'starship-123', {
  name: 'My Data Agent',
});
```

### Workflow Management

```typescript
import { WorkflowRepository } from '@starships/models';
const workflowRepo = new WorkflowRepository();

// Create workflow
const workflow = await workflowRepo.create({
  name: 'Data Processing Pipeline',
  category: 'automation',
  authorId: 'user-123',
  starshipId: 'starship-456',
  isPublic: false,
  blueprint: {
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Begin workflow', parameters: {} },
      {
        ref: 'process',
        type: 'agent',
        name: 'Process Data',
        description: 'AI data processing',
        parameters: { agentId: 'agent-789' },
      },
      { ref: 'end', type: 'end', name: 'End', description: 'Complete workflow', parameters: {} },
    ],
    edges: [
      { ref: 'start-to-process', from: 'start', to: 'process' },
      { ref: 'process-to-end', from: 'process', to: 'end' },
    ],
  },
});

// Deploy workflow to starship
await workflowRepo.updateStarshipId(workflow.id, 'starship-456');

// Find workflows by category
const automationWorkflows = await workflowRepo.findByCategory('automation');
```

## Serialization System

Professional data serialization/deserialization using class-transformer with lean validation using class-validator:

```typescript
import { ModelSerializer, Transformers, Transform, SerializableModel } from '@starships/models';

// Using ModelSerializer for simple transformations
const serializedData = ModelSerializer.serialize(data);
const deserializedData = ModelSerializer.deserialize(data, MyModelClass);

// Safe JSON operations with fallbacks
const parsed = ModelSerializer.safeJsonParse(jsonString, defaultValue);
const stringified = ModelSerializer.safeJsonStringify(object);

// Creating serializable model classes with validation and transformation decorators
import { IsString, IsNumber, IsOptional, Length, Min } from 'class-validator';

class SessionModel extends SerializableModel {
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  id!: string;

  @Transformers.DateTransform()
  createdAt!: Date;

  @Transformers.JsonTransform()
  @IsOptional()
  metadata?: any;

  @Transformers.ArrayTransform([])
  tags!: string[];

  @Transformers.NumberTransform(0)
  @IsNumber()
  @Min(0)
  messageCount!: number;

  // Simple validation method
  static async validateData(data: any): Promise<void> {
    const entity = new SessionModel();
    Object.assign(entity, data);
    const errors = await validate(entity);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.map((e) => Object.values(e.constraints || {}).join(', ')).join('; ')}`);
    }
  }
}

// Repositories automatically use serialization utilities
class MyRepository extends BaseRepository {
  // Built-in serialization methods available:
  // - this.serializeForDatabase(data, ModelClass?)
  // - this.deserializeFromDatabase(data, ModelClass)
  // - this.mapFromDatabaseRecord(data, options)
  // - this.safeJsonParse(json, fallback)
  // - this.safeJsonStringify(value)
}
```

### Available Transformers

| Transformer                 | Purpose                 | Example                                 |
| --------------------------- | ----------------------- | --------------------------------------- |
| `JsonTransform()`           | JSON string ↔ object   | `@Transformers.JsonTransform()`         |
| `DateTransform()`           | ISO string ↔ Date      | `@Transformers.DateTransform()`         |
| `ArrayTransform(default)`   | Ensure array type       | `@Transformers.ArrayTransform([])`      |
| `NumberTransform(default)`  | Safe number parsing     | `@Transformers.NumberTransform(0)`      |
| `BooleanTransform(default)` | Safe boolean conversion | `@Transformers.BooleanTransform(false)` |

## Logging & Monitoring

Built-in structured logging with performance tracking:

```typescript
import { logger, PerformanceMonitor } from '@starships/models';

// Structured logging
logger.info('Starship operation completed', {
  starshipId: 'starship-123',
  operation: 'deploy-agent',
  duration: 1250,
});

// Performance monitoring
const result = await PerformanceMonitor.measure('starship-creation', () => starshipRepo.create(starshipData));
```

## Environment Configuration

Required environment variables:

```bash
# Neo4j Configuration
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=starships

# Logging Configuration
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_METRICS=true
```

## Development Scripts

```json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc --build tsconfig.json",
  "migrate": "tsx src/scripts/migration-runner.ts",
  "backup:create": "tsx src/scripts/backup-cli.ts create",
  "monitor": "tsx src/scripts/performance-monitor.ts",
  "db-cli": "tsx src/scripts/db-cli.ts"
}
```

## Architecture

```
├── src/
│   ├── index.ts                 # Main exports
│   ├── helpers/                 # Utilities and shared logic
│   │   ├── database/            # Neo4j connection management
│   │   ├── errors/              # Error handling system
│   │   └── logging/             # Structured logging
│   ├── repositories/            # Data access implementations
│   │   ├── BaseRepository.ts    # Common repository functionality
│   │   └── index.ts             # Repository factory
│   ├── migrations/              # Database schema changes
│   └── scripts/                 # Management utilities
```

## Dependencies

- **Neo4j Driver** - Graph database connectivity
- **@starships/protocol** - Shared type definitions
- **UUID** - Unique identifier generation
- **TypeScript** - Type-safe development

## Health Checks

Monitor system health:

```typescript
import { HealthMonitor } from '@starships/models';

// Monitor system health directly
const health = await HealthMonitor.getSystemHealth();
console.log('System status:', health.status);
```

## Related Packages

This package is part of the starships.ai monorepo:

- [`@starships/protocol`](../protocol/) - Shared types and contracts
- [`@starships/server`](../server/) - API server and business logic
- [`@starships/client`](../client/) - Frontend application
- [`@starships/autopilot`](../autopilot/) - Workflow execution engine
- [`@starships/errors`](../errors/) - Comprehensive error handling system

## Development Status

This package is actively developed and production-ready. The repository pattern and serialization system provide a stable foundation for the starships.ai platform.

## License

Private package - Part of the starships.ai project
