// Add Sequential Thinking MCP Server to Starship
// Create MCP Server Connector instance
CREATE (c:MCPServerConnector {
  id: randomUUID(),
  templateSlug: 'sequentialthinking',
  name: 'Sequential Thinking',
  status: 'active',
  containerName: 'mcp-sequentialthinking-e3c3bfea',
  createdAt: datetime().epochMillis,
  updatedAt: datetime().epochMillis,
  config: '{}',
  isStatic: false,
  statusMessage: 'Active'
})

// Link to starship
WITH c
MATCH (s:Starship {id: 'e3c3bfea-ce12-45bf-b120-70f4bd423dad'})
CREATE (s)-[:HAS_CONNECTOR {createdAt: datetime().epochMillis}]->(c)

// Link to MCP Server Option
WITH c
MATCH (o:MCPServerOption {slug: 'sequentialthinking'})
CREATE (c)-[:INSTANCE_OF {createdAt: datetime().epochMillis}]->(o)

RETURN c.id as connectorId, c.name as name, c.status as status;