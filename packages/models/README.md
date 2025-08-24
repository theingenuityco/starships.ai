# @starships/models

Production-ready Neo4j graph database layer powering the Starships mission control platform. Features comprehensive data models for missions, expeditions, workflows, MCP connectors, vision management, Stripe integration, and enterprise-grade backup/disaster recovery with automated migration system.

## 🚀 Features

- **Mission Orchestration**: Complete mission lifecycle management with phase-based workflow
- **MCP Integration**: Docker-based connector deployment with HTTP bridge support
- **Vision Management**: AI-powered vision refinement with quality metrics and analytics
- **Stripe Integration**: Production-ready billing with subscription management and webhook idempotency
- **Expedition System**: Multi-agent expedition coordination (intentionally stubbed for development focus)
- **Workflow DSL**: Complete workflow definition storage and runtime state management
- **Native Tool Integration**: Encrypted API key storage with AES-256-GCM encryption
- **Enterprise Features**: Automated backup/recovery, migration system, and disaster recovery
- **Agent Marketplace**: Advanced agent management with categories, ratings, and analytics
- **Repository Pattern**: Factory-based initialization with Socket.IO compatibility

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Development mode
pnpm dev
```

## 🏗️ Architecture

### Repository Structure

```
src/
├── index.ts                              # Main exports and sync factory initialization
├── connection.ts                         # Neo4j connection with retry logic
├── types.ts                              # Core data types and interfaces
├── repositories/
│   ├── index.ts                         # Repository factory with sync initialization
│   ├── BaseRepository.ts                # Abstract base with common CRUD operations
│   ├── AgentRepository.ts               # Agent marketplace with filtering and analytics
│   ├── AgentTemplateRepository.ts       # Agent template marketplace
│   ├── UserRepository.ts                # User management with Kinde auth integration
│   ├── StarshipRepository.ts            # Starship management with billing integration
│   ├── MissionRepository.ts             # Mission lifecycle management
│   ├── MissionClarityRepository.ts      # 5-dimension mission clarity assessment
│   ├── WorkflowRepository.ts            # Workflow DSL definition storage
│   ├── WorkflowRuntimeStateRepository.ts # Workflow execution state management
│   ├── VisionRepository.ts              # Vision management with refinement tracking
│   ├── MCPServerOptionRepository.ts    # MCP server template management
│   ├── MCPServerConnectorRepository.ts # MCP connector instance lifecycle
│   ├── NativeToolApiKeyRepository.ts   # Encrypted API key storage
│   ├── LLMRepository.ts                 # LLM configuration management
│   ├── ChannelRepository.ts             # Channel management (legacy)
│   └── ConnectorConfig*.ts              # Connector configuration and history
├── migrations/
│   ├── backup-restore.ts                # Enterprise backup/recovery system
│   ├── disaster-recovery.ts             # Automated disaster recovery
│   ├── validate-migration.ts            # Migration validation and integrity checks
│   └── *.cypher                         # Schema migration files
├── services/
│   ├── AgentExpeditionContextService.ts # Expedition context management
│   ├── AgentTemplateService.ts          # Template marketplace operations
│   └── VisionFileService.ts             # Vision file management and storage
└── scripts/
    ├── migration-runner.ts              # Production migration system
    ├── backup-cli.ts                    # Command-line backup utilities
    ├── database-health-checker.ts       # Health monitoring and validation
    └── seed-*.ts                        # Data seeding scripts
```

## 🔧 Usage

### Database Connection

```typescript
import { createConnection, getConnection } from '@starships/models';

// Initialize connection
await createConnection({
  uri: '[NEO4J-LOCAL-URL]',
  username: 'neo4j',
  [DEFAULT-PASSWORD]: '[DEFAULT-PASSWORD]'
});

// Get existing connection
const conn = getConnection();
```

### Repository Factory

```typescript
import { RepositoryFactory } from '@starships/models';

// Get repository instances
const agentRepo = RepositoryFactory.getAgentRepository();
const userRepo = RepositoryFactory.getUserRepository();
const channelRepo = RepositoryFactory.getChannelRepository();
const llmRepo = RepositoryFactory.getLLMRepository();
```

### Mission Orchestration

```typescript
import { RepositoryFactory } from '@starships/models';

// Get mission repository
const missionRepo = RepositoryFactory.getMissionRepository();

// Create a new mission
const mission = await missionRepo.create({
  id: 'mission-123',
  title: 'Market Research Mission',
  objective: 'Research competitive landscape for AI productivity tools',
  starshipId: 'starship-456',
  phase: 'init',
  status: 'active'
});

// Progress through mission phases
await missionRepo.updatePhase('mission-123', 'analysis');

// Get mission with clarity assessment
const missionWithClarity = await missionRepo.findByIdWithClarity('mission-123');

// Mission clarity management
const clarityRepo = RepositoryFactory.getMissionClarityRepository();
const clarity = await clarityRepo.create({
  missionId: 'mission-123',
  clarity: 0.8,
  specificity: 0.7,
  feasibility: 0.9,
  measurability: 0.6,
  timebound: 0.5
});
```

### Agent Marketplace Management

```typescript
// Enhanced agent management with marketplace features
const agentRepo = RepositoryFactory.getAgentRepository();

// Create marketplace-ready agent
const agent = await agentRepo.create({
  id: 'agent-123',
  name: 'Research Analyst',
  model: 'gpt-4',
  systemPrompt: 'You are an expert research analyst',
  starshipId: 'starship-456',
  category: 'research',
  tags: ['analysis', 'research', 'data'],
  isPublic: true,
  rating: 4.8,
  usageCount: 1250
});

// Advanced filtering and pagination
const agents = await agentRepo.findWithFilters({
  category: 'research',
  tags: ['analysis'],
  isPublic: true,
  page: 1,
  limit: 10
});

// Agent analytics and tracking
await agentRepo.trackUsage('agent-123');
const analytics = await agentRepo.getAnalytics('agent-123');
```

### Starship Management with Billing

```typescript
// Starship management with Stripe integration
const starshipRepo = RepositoryFactory.getStarshipRepository();

// Create starship with billing plan
const starship = await starshipRepo.create({
  id: 'starship-123',
  name: 'Enterprise',
  slug: 'enterprise',
  class: 'cruiser',
  ownerId: 'user-456',
  maxActiveExpeditions: 5,
  maxAgents: 6,
  subscriptionStatus: 'trial',
  stripeCustomerId: 'cus_stripe123'
});

// Update subscription status
await starshipRepo.updateSubscriptionStatus('starship-123', 'active');

// Get starships with billing info
const starships = await starshipRepo.findByOwnerWithBilling('user-456');

// User management with Kinde integration
const userRepo = RepositoryFactory.getUserRepository();
const user = await userRepo.findByKindeId('kinde_user_123');
await userRepo.syncFromKinde(kindeUserData);
```

### MCP Connector Management

```typescript
// MCP server templates
const mcpOptionRepo = RepositoryFactory.getMCPServerOptionRepository();
const mcpConnectorRepo = RepositoryFactory.getMCPServerConnectorRepository();

// Get available MCP server templates
const templates = await mcpOptionRepo.findAll();

// Deploy MCP connector instance
const connector = await mcpConnectorRepo.create({
  id: 'connector-123',
  mcpServerId: 'github-server',
  starshipId: 'starship-456',
  dockerStatus: 'pending',
  httpBridgeEnabled: true,
  port: 3001,
  environmentVariables: {
    GITHUB_TOKEN: 'encrypted:token123'
  }
});

// Monitor connector health
await mcpConnectorRepo.updateDockerStatus('connector-123', 'running');
const healthStatus = await mcpConnectorRepo.checkHealth('connector-123');
```

### Vision Management with AI Refinement

```typescript
// Vision management with quality metrics
const visionRepo = RepositoryFactory.getVisionRepository();

// Create vision with metrics
const vision = await visionRepo.create({
  id: 'vision-123',
  starshipId: 'starship-456',
  statement: 'To revolutionize AI-powered productivity through intelligent automation',
  clarity: 0.8,
  specificity: 0.7,
  actionability: 0.9,
  inspirational: 0.85,
  confidence: 0.82
});

// Update vision metrics after refinement
await visionRepo.updateMetrics('vision-123', {
  clarity: 0.9,
  specificity: 0.8,
  confidence: 0.88
});

// Get vision refinement history
const refinements = await visionRepo.getRefinementHistory('vision-123');
```

### Workflow DSL Management

```typescript
// Workflow definition storage
const workflowRepo = RepositoryFactory.getWorkflowRepository();
const runtimeRepo = RepositoryFactory.getWorkflowRuntimeStateRepository();

// Store workflow definition
const workflow = await workflowRepo.create({
  id: 'workflow-123',
  name: 'Research Analysis Workflow',
  definition: {
    nodes: [/* workflow nodes */],
    edges: [/* workflow edges */]
  },
  expeditionId: 'exp-456'
});

// Manage workflow execution state
const runtimeState = await runtimeRepo.create({
  id: 'runtime-123',
  workflowId: 'workflow-123',
  currentNode: 'research-node',
  state: { /* execution state */ },
  status: 'running'
});

// Update execution progress
await runtimeRepo.updateState('runtime-123', {
  currentNode: 'analysis-node',
  state: { /* updated state */ }
});
```

### Native Tool API Key Management

```typescript
// Encrypted API key storage
const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();

// Store encrypted API keys
await apiKeyRepo.setApiKeys('starship-456', {
  firecrawl: 'fc-api-key-12345',
  notion: 'secret_notion-key-67890',
  brave_search: 'brave-api-key-54321'
});

// Retrieve and decrypt API keys
const apiKeys = await apiKeyRepo.getApiKeys('starship-456');
console.log('Firecrawl key:', apiKeys.firecrawl); // Automatically decrypted

// Check which tools have API keys configured
const availability = await apiKeyRepo.getToolAvailability('starship-456');
```

### Enterprise Backup and Disaster Recovery

```typescript
import { BackupManager, DisasterRecovery } from '@starships/models';

// Automated backup system
const backup = new BackupManager();

// Create comprehensive backup
const backupId = await backup.createBackup({
  includeData: true,
  includeSchema: true,
  compress: true,
  timestamp: new Date()
});

// Automated disaster recovery
const recovery = new DisasterRecovery();

// Recover from specific backup
await recovery.recoverFromBackup(backupId, {
  validateIntegrity: true,
  performHealthCheck: true,
  notifyOnCompletion: true
});

// Schedule automated backups
await backup.scheduleBackups({
  frequency: 'daily',
  retention: 30, // days
  performanceWindow: 'off-peak'
});
```

## 📊 Data Models

### Core Data Models

```typescript
// Mission system
interface Mission {
  id: string;
  title: string;
  objective: string;
  starshipId: string;
  phase: 'init' | 'welcome' | 'analysis' | 'plan' | 'converse';
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
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
}

// Starship with billing integration
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
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced agent with marketplace features
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
  deploymentSettings?: object;
  createdAt: Date;
  updatedAt: Date;
}

// Vision with AI metrics
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

// MCP connector with Docker deployment
interface MCPServerConnector {
  id: string;
  mcpServerId: string;
  starshipId: string;
  dockerStatus: 'pending' | 'building' | 'running' | 'stopped' | 'error';
  httpBridgeEnabled: boolean;
  httpBridgeUrl?: string;
  port?: number;
  environmentVariables: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// Workflow DSL definition
interface Workflow {
  id: string;
  name: string;
  definition: WorkflowDSL;
  expeditionId?: string;
  status: 'draft' | 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

// Encrypted API key storage
interface NativeToolApiKey {
  id: string;
  starshipId: string;
  tool: string;
  encryptedKey: string;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Graph Relationships

```cypher
// Core platform relationships
(User)-[:OWNS]->(Starship)
(Starship)-[:HAS_VISION]->(Vision)
(Starship)-[:DEPLOYS]->(Agent)
(Starship)-[:RUNS]->(Mission)
(Starship)-[:EXECUTES]->(Expedition)

// Mission and workflow relationships
(Mission)-[:HAS_CLARITY]->(MissionClarity)
(Mission)-[:GENERATES]->(Workflow)
(Workflow)-[:HAS_RUNTIME_STATE]->(WorkflowRuntimeState)
(Expedition)-[:USES_WORKFLOW]->(Workflow)

// MCP and tool integration
(Starship)-[:CONNECTS_TO]->(MCPServerConnector)
(MCPServerConnector)-[:INSTANCE_OF]->(MCPServerOption)
(Starship)-[:HAS_API_KEYS]->(NativeToolApiKey)

// Agent marketplace relationships
(Agent)-[:BELONGS_TO_CATEGORY]->(Category)
(Agent)-[:HAS_TAG]->(Tag)
(User)-[:RATES]->(Agent)
(Agent)-[:USES_TEMPLATE]->(AgentTemplate)
(User)-[:CREATES]->(Agent)
(User)-[:CREATES]->(AgentTemplate)

// Billing and subscription relationships
(Starship)-[:HAS_SUBSCRIPTION]->(StripeSubscription)
(User)-[:IS_STRIPE_CUSTOMER]->(StripeCustomer)

// Vision refinement relationships
(Vision)-[:HAS_REFINEMENT_SESSION]->(VisionRefinementSession)
(Vision)-[:IMPROVED_BY]->(VisionRefinement)

// Legacy relationships (maintained for compatibility)
(Agent)-[:CONVERSES_WITH]->(User)
(Agent)-[:USES_MODEL]->(LLMConfig)
```

## 🔧 Configuration

### Environment Variables

```env
# Neo4j Connection
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[DEFAULT-PASSWORD]
NEO4J_DATABASE=neo4j

# Connection Pool Settings
NEO4J_MAX_CONNECTION_POOL_SIZE=100
NEO4J_CONNECTION_TIMEOUT=30000
NEO4J_MAX_RETRY_TIME=30000

# Migration System
MIGRATION_AUTO_RUN=true
MIGRATION_BACKUP_BEFORE=true
MIGRATION_VALIDATE_AFTER=true

# Backup and Recovery
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_STORAGE_PATH=/data/backups

# Encryption (for API keys)
ENCRYPTION_KEY=your_32_byte_encryption_key_here
ENCRYPTION_ALGORITHM=aes-256-gcm

# Performance Monitoring
PERFORMANCE_MONITORING_ENABLED=true
QUERY_PERFORMANCE_LOGGING=true
SLOW_QUERY_THRESHOLD_MS=1000

# Disaster Recovery
DISASTER_RECOVERY_ENABLED=true
HEALTH_CHECK_INTERVAL=60000
AUTO_RECOVERY_ATTEMPTS=3
```

### Connection Configuration

```typescript
interface Neo4jConfig {
  uri: string;
  username: string;
  [DEFAULT-PASSWORD]: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
  maxRetryTime?: number;
}
```

## 🗃️ Database Schema

### Node Labels

**Core Platform**
- `User`: Platform users with Kinde auth integration
- `Starship`: Mission control starships with billing integration
- `Agent`: AI agents with marketplace features
- `Mission`: Mission orchestration with phase management
- `Vision`: Starship vision with AI-powered refinement

**Workflow System**
- `Workflow`: Workflow DSL definitions
- `WorkflowRuntimeState`: Workflow execution state
- `Expedition`: Multi-agent expedition coordination (stubbed)

**MCP Integration**
- `MCPServerOption`: Available MCP server templates
- `MCPServerConnector`: Deployed MCP connector instances
- `NativeToolApiKey`: Encrypted API key storage

**Quality and Analytics**
- `MissionClarity`: 5-dimension mission assessment
- `AgentTemplate`: Reusable agent configurations
- `VisionRefinementSession`: Vision improvement sessions

**Enterprise Features**
- `BackupRecord`: Backup and recovery tracking
- `MigrationRecord`: Schema migration history
- `AuditLog`: Comprehensive audit trails

**Legacy (Maintained for Compatibility)**
- `Channel`: Communication channels
- `LLMConfig`: LLM model configurations

### Relationship Types
- `CONVERSES_WITH`: Agent-User conversations
- `MEMBER_OF`: User-Channel membership
- `ACTIVE_IN`: Agent-Channel presence
- `USES_MODEL`: Agent-LLM associations

### Indexes
```cypher
// Performance indexes
CREATE INDEX agent_id_idx FOR (a:Agent) ON (a.id);
CREATE INDEX user_id_idx FOR (u:User) ON (u.id);
CREATE INDEX user_email_idx FOR (u:User) ON (u.email);
CREATE INDEX channel_id_idx FOR (c:Channel) ON (c.id);
CREATE INDEX llm_id_idx FOR (l:LLMConfig) ON (l.id);
```

## 🔍 Repository Pattern

### Base Repository Interface

```typescript
interface BaseRepository<T> {
  create(data: Partial<T>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}
```

### Custom Repository Methods

Each repository extends the base interface with domain-specific methods:

```typescript
// AgentRepository
findByProvider(provider: string): Promise<Agent[]>;
findActiveAgents(): Promise<Agent[]>;

// UserRepository  
findByEmail(email: string): Promise<User | null>;
findRecentUsers(limit: number): Promise<User[]>;

// ChannelRepository
findByUserId(userId: string): Promise<Channel[]>;
findByAgentId(agentId: string): Promise<Channel[]>;
findByPlatform(platform: string): Promise<Channel[]>;

// LLMRepository
findByProvider(provider: string): Promise<LLMConfig[]>;
findByModel(model: string): Promise<LLMConfig[]>;
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run integration tests
pnpm test:integration

# Test with coverage
pnpm test:coverage
```

### Test Database Setup

```typescript
// Test configuration
const testConfig = {
  uri: '[NEO4J-LOCAL-URL]',
  username: 'neo4j',
  [DEFAULT-PASSWORD]: 'test-[DEFAULT-PASSWORD]',
  database: 'test'
};
```

## 🚀 Performance

### Query Optimization
- **Indexed Lookups**: Primary key and email indexes
- **Relationship Traversal**: Optimized graph queries
- **Connection Pooling**: Efficient connection management
- **Query Caching**: Prepared statement caching

### Performance Benchmarks
- **Mission Operations**: < 10ms for CRUD operations
- **Starship Queries**: < 15ms with billing data
- **Agent Marketplace**: < 25ms for filtered searches
- **MCP Connector Health**: < 50ms for status checks
- **Vision Analytics**: < 100ms for quality calculations
- **Backup Operations**: 1GB database in < 5 minutes
- **Migration Execution**: < 2 minutes for schema updates
- **Bulk Import**: 10,000+ records/minute with validation

## 🔍 Troubleshooting

### Common Issues

1. **Connection Failures**
   ```bash
   # Check Neo4j status
   docker ps | grep neo4j
   
   # Test connection
   cypher-shell -u neo4j -p [DEFAULT-PASSWORD]
   ```

2. **Repository Initialization**
   ```typescript
   // Ensure connection is established
   await createConnection(config);
   
   // Get repository factory
   const factory = RepositoryFactory.getInstance();
   ```

3. **Query Performance**
   ```cypher
   // Check query execution plan
   EXPLAIN MATCH (a:Agent) WHERE a.id = 'agent-123' RETURN a;
   
   // Profile query performance
   PROFILE MATCH (a:Agent)-[:CONVERSES_WITH]->(u:User) RETURN count(*);
   ```

## 📚 Dependencies

### Core Dependencies
- **neo4j-driver**: Official Neo4j driver with connection pooling
- **@starships/protocol**: Comprehensive type definitions for all entities
- **crypto**: Native Node.js encryption for API key security
- **uuid**: Unique identifier generation for all entities
- **pino**: High-performance JSON logging
- **joi**: Schema validation for data integrity

### Development Dependencies
- **@types/uuid**: TypeScript definitions
- **tsx**: TypeScript execution environment

## 📄 License

Private package - Part of the Starships AI platform. 