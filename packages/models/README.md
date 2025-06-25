# @starships/models

Neo4j-based data layer for the Starships platform. Provides repositories and models for managing agents, users, channels, and LLM configurations with graph database relationships.

## 🚀 Features

- **Graph Database**: Neo4j integration with Cypher queries
- **Repository Pattern**: Clean data access abstraction
- **Type Safety**: Full TypeScript support with strict typing
- **Connection Management**: Automatic connection pooling and retry logic
- **Relationship Modeling**: Graph-based entity relationships

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
├── index.ts                    # Main exports and factory
├── connection.ts               # Neo4j connection management
├── types.ts                    # Core data types and interfaces
└── repositories/
    ├── index.ts               # Repository factory
    ├── AgentRepository.ts     # Agent data access
    ├── UserRepository.ts      # User data access
    ├── ChannelRepository.ts   # Channel data access
    └── LLMRepository.ts       # LLM configuration access
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

### Agent Management

```typescript
// Create a new agent
const agent = await agentRepo.create({
  id: 'agent-123',
  name: 'Assistant',
  model: 'gpt-4',
  provider: 'openai',
  systemPrompt: 'You are a helpful assistant'
});

// Find agent by ID
const agent = await agentRepo.findById('agent-123');

// Update agent configuration
await agentRepo.update('agent-123', {
  systemPrompt: 'Updated system prompt'
});

// List all agents
const agents = await agentRepo.findAll();

// Delete agent
await agentRepo.delete('agent-123');
```

### User Management

```typescript
// Create user
const user = await userRepo.create({
  id: 'user-456',
  name: 'John Doe',
  email: 'john@example.com'
});

// Find user by ID
const user = await userRepo.findById('user-456');

// Find user by email
const user = await userRepo.findByEmail('john@example.com');

// Update user
await userRepo.update('user-456', {
  name: 'John Smith'
});
```

### Channel Management

```typescript
// Create channel
const channel = await channelRepo.create({
  id: 'channel-789',
  name: 'general',
  type: 'text',
  platform: 'discord'
});

// Find channels for user
const channels = await channelRepo.findByUserId('user-456');

// Find channels for agent
const channels = await channelRepo.findByAgentId('agent-123');
```

### LLM Configuration

```typescript
// Create LLM configuration
const llmConfig = await llmRepo.create({
  id: 'gpt-4-config',
  name: 'GPT-4 Default',
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 1.0
});

// Find LLM by ID
const llm = await llmRepo.findById('gpt-4-config');

// Find LLMs by provider
const llms = await llmRepo.findByProvider('openai');
```

## 📊 Data Models

### Core Types

```typescript
interface Agent {
  id: string;
  name: string;
  model: string;
  provider?: 'openai' | 'anthropic';
  systemPrompt?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'dm';
  platform: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface LLMConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic';
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
```

### Graph Relationships

```cypher
// Agent-User conversations
(Agent)-[:CONVERSES_WITH]->(User)

// User-Channel membership
(User)-[:MEMBER_OF]->(Channel)

// Agent-Channel presence
(Agent)-[:ACTIVE_IN]->(Channel)

// Agent-LLM configuration
(Agent)-[:USES_MODEL]->(LLMConfig)
```

## 🔧 Configuration

### Environment Variables

```env
# Neo4j Connection
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[DEFAULT-PASSWORD]

# Connection Pool Settings
NEO4J_MAX_CONNECTION_POOL_SIZE=100
NEO4J_CONNECTION_TIMEOUT=30000
NEO4J_MAX_RETRY_TIME=30000
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
- `Agent`: AI agent configurations
- `User`: Platform users
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

### Benchmarks
- **Single Record Lookup**: < 5ms
- **Relationship Queries**: < 20ms
- **Bulk Operations**: 1000+ records/second

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
- **neo4j-driver**: Official Neo4j driver for Node.js
- **@starships/protocol**: Shared type definitions
- **uuid**: Unique identifier generation

### Development Dependencies
- **@types/uuid**: TypeScript definitions
- **tsx**: TypeScript execution environment

## 📄 License

Private package - Part of the Starships AI platform. 