# MCP Server with Neo4j Integration

This version of the MCP Server integrates with Neo4j for persistent storage of agents, models, users, and channels, while keeping sessions and messages in the existing memory store.

## Architecture

- **Neo4j**: Persistent storage for entities and relationships
  - Agents, Models, Users, Channels
  - Relationships: INTERACTS_WITH, USES, ACTIVE_IN, DEPLOYED_IN
- **Memory Store**: Volatile storage for chat sessions and messages (unchanged)

## Quick Start with Docker Compose

### Prerequisites

- Docker and Docker Compose installed
- Ports 4000 and 7474, 7687 available

### Start Services

```bash
# Run the start script
./scripts/start-with-neo4j.sh
```

Or manually:

```bash
# Start Neo4j and MCP Server
docker-compose up --build -d

# Check logs
docker-compose logs -f mcp-server
docker-compose logs -f neo4j
```

### Access Points

- **MCP Server API**: http://localhost:4000
- **Neo4j Browser**: http://localhost:7474
  - Username: `neo4j`
  - Password: `mcppassword`

## Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Server Configuration
NODE_ENV=development
PORT=4000

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
```

## API Endpoints

### Agents

- `GET /v1/agents` - List all agents
- `GET /v1/agents/:id` - Get agent by ID
- `POST /v1/agents` - Create new agent

#### Create Agent Example

```bash
curl -X POST http://localhost:4000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Assistant",
    "model": "gpt-4",
    "systemPrompt": "You are a helpful coding assistant."
  }'
```

## Neo4j Graph Model

### Node Types

```cypher
// Agents
(:Agent {id, name, model, systemPrompt, createdAt})

// Models
(:Model {id, name, provider, maxTokens, temperature})

// Users
(:User {id, username, email, createdAt})

// Channels
(:Channel {id, name, type, guildId, createdAt})
```

### Relationships

```cypher
// User interactions
(u:User)-[:INTERACTS_WITH {lastInteraction, interactionCount}]->(a:Agent)

// Agent model usage
(a:Agent)-[:USES {configuredAt}]->(m:Model)

// User channel membership
(u:User)-[:ACTIVE_IN {joinedAt, role}]->(c:Channel)

// Agent deployments
(a:Agent)-[:DEPLOYED_IN {deployedAt, status}]->(c:Channel)
```

## Default Data

The system automatically seeds with default agents on first startup:

1. **Assistant** - General purpose helper
2. **Code Helper** - Software development assistant
3. **Creative Writer** - Creative content assistant

## Development

### Local Development (without Docker)

1. Start Neo4j locally or use Neo4j Cloud
2. Set environment variables
3. Install dependencies: `pnpm install`
4. Build packages: `pnpm run build`
5. Start server: `pnpm run dev`

### Adding Custom Agents

Use the Neo4j Browser or API to add agents:

```cypher
CREATE (a:Agent {
  id: 'custom-agent-1',
  name: 'Custom Agent',
  model: 'gpt-3.5-turbo',
  systemPrompt: 'You are a custom assistant.',
  createdAt: datetime().epochMillis
})
```

## Monitoring

### Health Checks

- Server: `curl http://localhost:4000/`
- Neo4j: `curl http://localhost:7474/`

### Logs

```bash
# Server logs
docker-compose logs -f mcp-server

# Neo4j logs
docker-compose logs -f neo4j

# All logs
docker-compose logs -f
```

## Troubleshooting

### Neo4j Connection Issues

1. Check Neo4j is running: `docker-compose ps`
2. Verify credentials in environment variables
3. Check network connectivity between containers

### Common Cypher Queries

```cypher
// List all agents
MATCH (a:Agent) RETURN a

// Find agent interactions
MATCH (u:User)-[r:INTERACTS_WITH]->(a:Agent)
RETURN u.username, a.name, r.interactionCount

// Show agent deployments
MATCH (a:Agent)-[r:DEPLOYED_IN]->(c:Channel)
RETURN a.name, c.name, r.status
```

## Cleanup

```bash
# Stop services
docker-compose down

# Remove volumes (⚠️ deletes all data)
docker-compose down -v
``` 