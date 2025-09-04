# @starships/models

Data access layer and repository implementations for Starships.ai - a space-themed AI platform with autonomous agents deployed on configurable starships.

## Overview

This package provides:

- **Neo4j Database Integration** - Graph database connectivity and session management
- **Repository Pattern** - Standardized data access with direct repository imports
- **Error Handling** - Unified error system with proper categorization
- **Performance Monitoring** - Built-in logging and performance tracking
- **Migration System** - Database schema management and seeding
- **Backup & Recovery** - Database maintenance utilities

## Quick Start

```typescript
import {
  StarshipRepository,
  AgentRepository,
  UserRepository,
  createConnection,
  Neo4jConfig,
} from '@starships/models';

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

### Starship System

- **Starships**: Configurable AI platforms with different classes (`scout`, `cruiser`, `draught`)
- **Agents**: AI entities deployed on starships with specific roles and capabilities
- **Missions**: Task execution contexts with phases and messaging

### Direct Repository Usage
Direct repository instantiation for clean and simple data access:

```typescript
// Import and instantiate repositories directly
import {
  StarshipRepository,
  AgentRepository,
  MissionRepository,
  UserRepository,
} from '@starships/models';

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

| Repository                     | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| **StarshipRepository**         | Starship CRUD, agent deployment, status management |
| **AgentRepository**            | Agent management, template instantiation           |
| **AgentTemplateRepository**    | Reusable agent configurations                      |
| **UserRepository**             | User accounts and authentication                   |
| **MissionRepository**          | Mission lifecycle management                       |
| **MissionMessageRepository**   | Mission communication logs                         |
| **MissionClarityRepository**   | Mission requirement analysis                       |
| **WorkflowRepository**         | Workflow definitions and execution                 |
| **NativeToolApiKeyRepository** | API key management                                 |
| **WaitlistRepository**         | User onboarding queue                              |

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
const result = await PerformanceMonitor.measure('starship-creation', () =>
  starshipRepo.create(starshipData)
);
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

This package is part of the Starships.ai monorepo:

- [`@starships/protocol`](../protocol/) - Shared types and contracts
- [`@starships/server`](../server/) - API server and business logic
- [`@starships/client`](../client/) - Frontend application
- [`@starships/agent-engine`](../agent-engine/) - AI agent execution engine
- [`@starships/env-config`](../env-config/) - Environment configuration

## Development Status

This package is actively developed and part of a private project. The API is stable but may evolve as new features are added to the platform.

## Support

For issues and questions related to this package, refer to the main project documentation or contact the development team.
